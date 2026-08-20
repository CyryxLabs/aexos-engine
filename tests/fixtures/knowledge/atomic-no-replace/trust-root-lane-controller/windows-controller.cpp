#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <aclapi.h>
#include <sddl.h>
#include <shlobj.h>

#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

namespace {

constexpr wchar_t kAdminSid[] = L"S-1-5-32-544";
constexpr wchar_t kMediumIntegritySid[] = L"S-1-16-8192";

[[noreturn]] void Fail(const char* message, DWORD error = GetLastError()) {
  std::fprintf(stderr, "B0P_ELEVATED_LANE_FAIL:%s:error=%lu\n", message,
               static_cast<unsigned long>(error));
  std::exit(1);
}

void Require(bool condition, const char* message) {
  if (!condition) Fail(message);
}

std::vector<BYTE> TokenInformation(HANDLE token, TOKEN_INFORMATION_CLASS kind) {
  DWORD bytes = 0;
  GetTokenInformation(token, kind, nullptr, 0, &bytes);
  if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || bytes == 0) {
    Fail("TOKEN_INFORMATION_SIZE");
  }
  std::vector<BYTE> buffer(bytes);
  if (!GetTokenInformation(token, kind, buffer.data(), bytes, &bytes)) {
    Fail("TOKEN_INFORMATION_READ");
  }
  return buffer;
}

std::wstring SidString(PSID sid) {
  LPWSTR value = nullptr;
  if (!ConvertSidToStringSidW(sid, &value)) Fail("SID_TO_STRING");
  std::wstring result(value);
  LocalFree(value);
  return result;
}

PSID WellKnownAdminSid(std::vector<BYTE>* storage) {
  DWORD bytes = SECURITY_MAX_SID_SIZE;
  storage->resize(bytes);
  if (!CreateWellKnownSid(WinBuiltinAdministratorsSid, nullptr, storage->data(), &bytes)) {
    Fail("CREATE_ADMIN_SID");
  }
  storage->resize(bytes);
  return storage->data();
}

std::wstring ProgramFilesRoot() {
  PWSTR value = nullptr;
  HRESULT result = SHGetKnownFolderPath(FOLDERID_ProgramFiles, KF_FLAG_DEFAULT, nullptr, &value);
  if (FAILED(result) || value == nullptr) {
    Fail("PROGRAM_FILES_KNOWN_FOLDER", static_cast<DWORD>(result));
  }
  std::wstring root(value);
  CoTaskMemFree(value);
  return root;
}

bool Exists(const std::wstring& path) {
  DWORD attributes = GetFileAttributesW(path.c_str());
  return attributes != INVALID_FILE_ATTRIBUTES;
}

void ApplyProtectedRootSecurity(const std::wstring& root, const std::wstring& runtime_sid) {
  std::wstring sddl = L"O:BAG:BAD:P(A;;FA;;;BA)(A;;FA;;;SY)(A;;GRGX;;;" + runtime_sid + L")";
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
          sddl.c_str(), SDDL_REVISION_1, &descriptor, nullptr)) {
    Fail("ROOT_SDDL_PARSE");
  }
  BOOL applied = SetFileSecurityW(
      root.c_str(), OWNER_SECURITY_INFORMATION | GROUP_SECURITY_INFORMATION |
                        DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
      descriptor);
  LocalFree(descriptor);
  if (!applied) Fail("ROOT_SECURITY_APPLY");
}

void RequireAccessDenied(DWORD error, const char* message) {
  if (error != ERROR_ACCESS_DENIED && error != ERROR_PRIVILEGE_NOT_HELD) {
    Fail(message, error);
  }
}

int RestrictedChild(const std::wstring& root) {
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) Fail("CHILD_OPEN_TOKEN");

  auto user_buffer = TokenInformation(token, TokenUser);
  auto* user = reinterpret_cast<TOKEN_USER*>(user_buffer.data());
  std::wstring user_sid = SidString(user->User.Sid);
  Require(user_sid != kAdminSid, "CHILD_USER_EQUALS_INSTALLER_OWNER");

  std::vector<BYTE> admin_storage;
  PSID admin_sid = WellKnownAdminSid(&admin_storage);
  auto groups_buffer = TokenInformation(token, TokenGroups);
  auto* groups = reinterpret_cast<TOKEN_GROUPS*>(groups_buffer.data());
  bool admin_deny_only = false;
  for (DWORD index = 0; index < groups->GroupCount; ++index) {
    if (EqualSid(groups->Groups[index].Sid, admin_sid)) {
      admin_deny_only =
          (groups->Groups[index].Attributes & SE_GROUP_USE_FOR_DENY_ONLY) != 0;
      break;
    }
  }
  Require(admin_deny_only, "ADMIN_GROUP_NOT_DENY_ONLY");

  auto integrity_buffer = TokenInformation(token, TokenIntegrityLevel);
  auto* integrity = reinterpret_cast<TOKEN_MANDATORY_LABEL*>(integrity_buffer.data());
  DWORD integrity_rid = *GetSidSubAuthority(
      integrity->Label.Sid, static_cast<DWORD>(*GetSidSubAuthorityCount(integrity->Label.Sid) - 1));
  Require(integrity_rid == SECURITY_MANDATORY_MEDIUM_RID, "CHILD_INTEGRITY_NOT_MEDIUM");

  auto privileges_buffer = TokenInformation(token, TokenPrivileges);
  auto* privileges = reinterpret_cast<TOKEN_PRIVILEGES*>(privileges_buffer.data());
  for (DWORD index = 0; index < privileges->PrivilegeCount; ++index) {
    if ((privileges->Privileges[index].Attributes & SE_PRIVILEGE_ENABLED) == 0) continue;
    wchar_t name[128] = {};
    DWORD name_length = static_cast<DWORD>(sizeof(name) / sizeof(name[0]));
    if (!LookupPrivilegeNameW(nullptr, &privileges->Privileges[index].Luid, name, &name_length)) {
      Fail("LOOKUP_PRIVILEGE_NAME");
    }
    Require(std::wstring(name) == L"SeChangeNotifyPrivilege", "FORBIDDEN_PRIVILEGE_ENABLED");
  }

  std::wstring forbidden = root + L"\\runtime-write-must-fail";
  SetLastError(ERROR_SUCCESS);
  HANDLE file = CreateFileW(forbidden.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
                            FILE_ATTRIBUTE_NORMAL, nullptr);
  Require(file == INVALID_HANDLE_VALUE, "ROOT_WRITE_NOT_DENIED");
  RequireAccessDenied(GetLastError(), "ROOT_WRITE_WRONG_ERROR");

  std::wstring sentinel = root + L"\\owner-sentinel";
  SetLastError(ERROR_SUCCESS);
  Require(!DeleteFileW(sentinel.c_str()), "ROOT_DELETE_NOT_DENIED");
  RequireAccessDenied(GetLastError(), "ROOT_DELETE_WRONG_ERROR");

  PSID owner = nullptr;
  PACL dacl = nullptr;
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  DWORD security_error = GetNamedSecurityInfoW(
      const_cast<LPWSTR>(root.c_str()), SE_FILE_OBJECT,
      OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
      &owner, nullptr, &dacl, nullptr, &descriptor);
  if (security_error != ERROR_SUCCESS) Fail("ROOT_SECURITY_READ", security_error);
  Require(EqualSid(owner, admin_sid) != FALSE, "ROOT_OWNER_NOT_ADMINISTRATORS");

  security_error = SetNamedSecurityInfoW(const_cast<LPWSTR>(root.c_str()), SE_FILE_OBJECT,
                                         DACL_SECURITY_INFORMATION, nullptr, nullptr, dacl,
                                         nullptr);
  RequireAccessDenied(security_error, "ROOT_DACL_WRITE_NOT_DENIED");
  security_error = SetNamedSecurityInfoW(const_cast<LPWSTR>(root.c_str()), SE_FILE_OBJECT,
                                         OWNER_SECURITY_INFORMATION, user->User.Sid, nullptr,
                                         nullptr, nullptr);
  RequireAccessDenied(security_error, "ROOT_OWNER_WRITE_NOT_DENIED");
  LocalFree(descriptor);
  CloseHandle(token);

  std::printf(
      "{\"runtimeSid\":\"%ls\",\"integrityRid\":8192,\"administratorsDenyOnly\":true,"
      "\"forbiddenPrivilegesEnabled\":0,\"rootWrite\":false,\"rootDelete\":false,"
      "\"rootAcl\":false,\"rootOwner\":false,\"ready\":true}\n",
      user_sid.c_str());
  std::fflush(stdout);
  return 0;
}

int ElevatedController() {
  Require(IsUserAnAdmin() != FALSE, "CONTROLLER_NOT_ADMINISTRATOR");

  std::wstring program_files = ProgramFilesRoot();
  std::wstring parent = program_files + L"\\AEXOS";
  std::wstring root = parent + L"\\NativeCapability";
  Require(!Exists(root), "INSTALL_ROOT_ALREADY_EXISTS");
  bool parent_created = false;
  if (!Exists(parent)) {
    if (!CreateDirectoryW(parent.c_str(), nullptr)) Fail("CREATE_INSTALL_PARENT");
    parent_created = true;
  }
  if (!CreateDirectoryW(root.c_str(), nullptr)) Fail("CREATE_INSTALL_ROOT");

  HANDLE process_token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(),
                        TOKEN_ASSIGN_PRIMARY | TOKEN_DUPLICATE | TOKEN_QUERY |
                            TOKEN_ADJUST_DEFAULT | TOKEN_ADJUST_SESSIONID,
                        &process_token)) {
    Fail("CONTROLLER_OPEN_TOKEN");
  }
  auto user_buffer = TokenInformation(process_token, TokenUser);
  auto* user = reinterpret_cast<TOKEN_USER*>(user_buffer.data());
  std::wstring runtime_sid = SidString(user->User.Sid);
  Require(runtime_sid != kAdminSid, "RUNTIME_USER_EQUALS_INSTALLER_OWNER");
  ApplyProtectedRootSecurity(root, runtime_sid);

  std::wstring sentinel_path = root + L"\\owner-sentinel";
  HANDLE sentinel = CreateFileW(sentinel_path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
                                FILE_ATTRIBUTE_READONLY, nullptr);
  if (sentinel == INVALID_HANDLE_VALUE) Fail("CREATE_SENTINEL");
  CloseHandle(sentinel);

  std::vector<BYTE> admin_storage;
  PSID admin_sid = WellKnownAdminSid(&admin_storage);
  SID_AND_ATTRIBUTES disabled_admin = {admin_sid, 0};
  HANDLE restricted_token = nullptr;
  if (!CreateRestrictedToken(process_token, DISABLE_MAX_PRIVILEGE | LUA_TOKEN, 1,
                             &disabled_admin, 0, nullptr, 0, nullptr, &restricted_token)) {
    Fail("CREATE_RESTRICTED_TOKEN");
  }

  PSID medium_sid = nullptr;
  if (!ConvertStringSidToSidW(kMediumIntegritySid, &medium_sid)) Fail("MEDIUM_SID_PARSE");
  TOKEN_MANDATORY_LABEL medium_label = {};
  medium_label.Label.Attributes = SE_GROUP_INTEGRITY;
  medium_label.Label.Sid = medium_sid;
  DWORD medium_bytes = static_cast<DWORD>(sizeof(TOKEN_MANDATORY_LABEL) + GetLengthSid(medium_sid));
  if (!SetTokenInformation(restricted_token, TokenIntegrityLevel, &medium_label, medium_bytes)) {
    Fail("SET_MEDIUM_INTEGRITY");
  }
  LocalFree(medium_sid);

  wchar_t executable[MAX_PATH] = {};
  DWORD executable_length = GetModuleFileNameW(nullptr, executable, MAX_PATH);
  Require(executable_length > 0 && executable_length < MAX_PATH, "CONTROLLER_PATH");
  std::wstring command = L"\"" + std::wstring(executable) + L"\" --child \"" + root + L"\"";
  std::vector<wchar_t> command_buffer(command.begin(), command.end());
  command_buffer.push_back(L'\0');
  wchar_t empty_environment[2] = {L'\0', L'\0'};
  STARTUPINFOW startup = {};
  startup.cb = sizeof(startup);
  startup.dwFlags = STARTF_USESTDHANDLES;
  startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  startup.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
  startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);
  PROCESS_INFORMATION process = {};
  if (!CreateProcessAsUserW(restricted_token, executable, command_buffer.data(), nullptr,
                            nullptr, TRUE, CREATE_UNICODE_ENVIRONMENT, empty_environment,
                            nullptr, &startup, &process)) {
    Fail("CREATE_PROCESS_AS_USER");
  }
  WaitForSingleObject(process.hProcess, INFINITE);
  DWORD child_exit = 1;
  if (!GetExitCodeProcess(process.hProcess, &child_exit)) Fail("CHILD_EXIT_READ");
  CloseHandle(process.hThread);
  CloseHandle(process.hProcess);
  CloseHandle(restricted_token);
  CloseHandle(process_token);
  Require(child_exit == 0, "RESTRICTED_CHILD_FAILED");

  SetFileAttributesW(sentinel_path.c_str(), FILE_ATTRIBUTE_NORMAL);
  if (!DeleteFileW(sentinel_path.c_str())) Fail("CLEAN_SENTINEL");
  if (!RemoveDirectoryW(root.c_str())) Fail("CLEAN_INSTALL_ROOT");
  if (parent_created && !RemoveDirectoryW(parent.c_str())) Fail("CLEAN_INSTALL_PARENT");

  std::printf(
      "{\"installerPrincipalId\":\"S-1-5-32-544\",\"runtimeSid\":\"%ls\","
      "\"controller\":\"elevated\",\"createRestrictedToken\":true,"
      "\"createProcessAsUserW\":true,\"ready\":true}\n",
      runtime_sid.c_str());
  return 0;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc == 3 && std::wstring(argv[1]) == L"--child") {
    return RestrictedChild(argv[2]);
  }
  Require(argc == 1, "ARGUMENTS_FORBIDDEN");
  return ElevatedController();
}
