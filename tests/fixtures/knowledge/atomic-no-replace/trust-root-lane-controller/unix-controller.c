#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <pwd.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#if defined(__APPLE__)
#define INSTALL_ROOT "/Library/Application Support/AEXOS/NativeCapability"
#define INSTALL_PARENT "/Library/Application Support/AEXOS"
#else
#define INSTALL_ROOT "/opt/aexos/native-capability"
#define INSTALL_PARENT "/opt/aexos"
#endif

static void fail(const char *message) {
  fprintf(stderr, "B0P_ELEVATED_LANE_FAIL:%s:errno=%d\n", message, errno);
  exit(1);
}

static void require(bool condition, const char *message) {
  if (!condition) fail(message);
}

static bool path_exists(const char *path) {
  struct stat value;
  return lstat(path, &value) == 0;
}

static void ensure_parent(void) {
#if defined(__APPLE__)
  if (!path_exists(INSTALL_PARENT) && mkdir(INSTALL_PARENT, 0755) != 0) {
    fail("CREATE_INSTALL_PARENT");
  }
#else
  if (!path_exists(INSTALL_PARENT) && mkdir(INSTALL_PARENT, 0755) != 0) {
    fail("CREATE_INSTALL_PARENT");
  }
#endif
}

#if defined(__linux__)
static uint64_t capability_value(const char *name) {
  FILE *file = fopen("/proc/self/status", "r");
  if (file == NULL) fail("OPEN_PROC_STATUS");
  char *line = NULL;
  size_t capacity = 0;
  uint64_t value = UINT64_MAX;
  while (getline(&line, &capacity, file) >= 0) {
    if (strncmp(line, name, strlen(name)) == 0) {
      char *cursor = strchr(line, '\t');
      if (cursor == NULL) cursor = strchr(line, ':');
      if (cursor != NULL) value = strtoull(cursor + 1, NULL, 16);
      break;
    }
  }
  free(line);
  fclose(file);
  return value;
}
#endif

static int restricted_child(uid_t runtime_uid, gid_t runtime_gid) {
  if (setgroups(0, NULL) != 0) fail("SETGROUPS");
#if defined(__APPLE__)
  if (setgid(runtime_gid) != 0) fail("SETGID");
  if (setuid(runtime_uid) != 0) fail("SETUID");
  require(getuid() == runtime_uid && geteuid() == runtime_uid, "UID_NOT_RESTRICTED");
  require(getgid() == runtime_gid && getegid() == runtime_gid, "GID_NOT_RESTRICTED");
#else
  if (setresgid(runtime_gid, runtime_gid, runtime_gid) != 0) fail("SETRESGID");
  if (setresuid(runtime_uid, runtime_uid, runtime_uid) != 0) fail("SETRESUID");
  uid_t real_uid = 0;
  uid_t effective_uid = 0;
  uid_t saved_uid = 0;
  gid_t real_gid = 0;
  gid_t effective_gid = 0;
  gid_t saved_gid = 0;
  if (getresuid(&real_uid, &effective_uid, &saved_uid) != 0) fail("GETRESUID");
  if (getresgid(&real_gid, &effective_gid, &saved_gid) != 0) fail("GETRESGID");
  require(real_uid == runtime_uid && effective_uid == runtime_uid && saved_uid == runtime_uid,
          "UID_NOT_RESTRICTED");
  require(real_gid == runtime_gid && effective_gid == runtime_gid && saved_gid == runtime_gid,
          "GID_NOT_RESTRICTED");
  require(capability_value("CapEff:") == 0, "CAP_EFFECTIVE_NONZERO");
  require(capability_value("CapPrm:") == 0, "CAP_PERMITTED_NONZERO");
  require(capability_value("CapAmb:") == 0, "CAP_AMBIENT_NONZERO");
#endif

  errno = 0;
  require(setuid(0) == -1 && errno == EPERM, "ROOT_REGAIN_NOT_DENIED");

  char forbidden_path[512];
  int length = snprintf(forbidden_path, sizeof(forbidden_path), "%s/%s", INSTALL_ROOT,
                        "runtime-write-must-fail");
  require(length > 0 && (size_t)length < sizeof(forbidden_path), "FORBIDDEN_PATH_OVERFLOW");
  errno = 0;
  int forbidden = open(forbidden_path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
  require(forbidden == -1 && (errno == EACCES || errno == EPERM), "ROOT_WRITE_NOT_DENIED");

  char sentinel_path[512];
  length = snprintf(sentinel_path, sizeof(sentinel_path), "%s/%s", INSTALL_ROOT, "owner-sentinel");
  require(length > 0 && (size_t)length < sizeof(sentinel_path), "SENTINEL_PATH_OVERFLOW");
  errno = 0;
  require(unlink(sentinel_path) == -1 && (errno == EACCES || errno == EPERM),
          "ROOT_DELETE_NOT_DENIED");
  errno = 0;
  require(chmod(sentinel_path, 0600) == -1 && (errno == EACCES || errno == EPERM),
          "ROOT_ACL_NOT_DENIED");

  printf("{\"runtimeUid\":%llu,\"runtimeGid\":%llu,\"rootWrite\":false,"
         "\"rootDelete\":false,\"rootAcl\":false,\"rootRegain\":false,\"ready\":true}\n",
         (unsigned long long)runtime_uid, (unsigned long long)runtime_gid);
  fflush(stdout);
  return 0;
}

int main(int argc, char **argv) {
  (void)argv;
  require(argc == 1, "ARGUMENTS_FORBIDDEN");
  require(getuid() == 0 && geteuid() == 0, "CONTROLLER_NOT_ROOT");
  require(!path_exists(INSTALL_ROOT), "INSTALL_ROOT_ALREADY_EXISTS");

  struct passwd *runtime = getpwnam("nobody");
  require(runtime != NULL, "RUNTIME_PRINCIPAL_MISSING");
  require(runtime->pw_uid != 0 && runtime->pw_gid != 0, "RUNTIME_PRINCIPAL_PRIVILEGED");

  ensure_parent();
  if (mkdir(INSTALL_ROOT, 0755) != 0) fail("CREATE_INSTALL_ROOT");
  if (chown(INSTALL_ROOT, 0, 0) != 0) fail("CHOWN_INSTALL_ROOT");
  if (chmod(INSTALL_ROOT, 0755) != 0) fail("CHMOD_INSTALL_ROOT");

  char sentinel_path[512];
  int length = snprintf(sentinel_path, sizeof(sentinel_path), "%s/%s", INSTALL_ROOT, "owner-sentinel");
  require(length > 0 && (size_t)length < sizeof(sentinel_path), "SENTINEL_PATH_OVERFLOW");
  int sentinel = open(sentinel_path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0444);
  if (sentinel == -1) fail("CREATE_SENTINEL");
  if (close(sentinel) != 0) fail("CLOSE_SENTINEL");
  if (chown(sentinel_path, 0, 0) != 0) fail("CHOWN_SENTINEL");
  if (chmod(sentinel_path, 0444) != 0) fail("CHMOD_SENTINEL");

  pid_t child = fork();
  if (child == -1) fail("FORK");
  if (child == 0) return restricted_child(runtime->pw_uid, runtime->pw_gid);

  int status = 0;
  if (waitpid(child, &status, 0) != child) fail("WAITPID");
  require(WIFEXITED(status) && WEXITSTATUS(status) == 0, "RESTRICTED_CHILD_FAILED");

  if (unlink(sentinel_path) != 0) fail("CLEAN_SENTINEL");
  if (rmdir(INSTALL_ROOT) != 0) fail("CLEAN_INSTALL_ROOT");
  printf("{\"installerUid\":0,\"installerGid\":0,\"runtimeUid\":%llu,"
         "\"runtimeGid\":%llu,\"controller\":\"elevated\",\"ready\":true}\n",
         (unsigned long long)runtime->pw_uid, (unsigned long long)runtime->pw_gid);
  return 0;
}
