using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;
using Aexos.FiniteTransport;
using static FiniteRelay;
namespace Aexos.FiniteTransport {
 public sealed class ProtectedChildPolicy {
  readonly string sid,image;
  internal ProtectedChildPolicy(string sid,string image){this.sid=sid;this.image=image;}
  internal void Check(ProcessPin coordinator,ProcessPin child){ProtectedNative.RequireElevated(coordinator,sid);ProtectedNative.RequireElevated(child,sid);Need(child.ImageSha256.Equals(image,StringComparison.OrdinalIgnoreCase)&&child.SeSecurityPrivilege=="disabled"&&coordinator.SeSecurityPrivilege=="disabled"&&child.TokenId!=coordinator.TokenId,"CHILD_POLICY");Need(ProtectedNative.Logon(child)==ProtectedNative.Logon(coordinator)&&ProtectedNative.Session(child)==ProtectedNative.Session(coordinator),"CHILD_LOGON");}
 }
}
public static class ProtectedNative {
 [StructLayout(LayoutKind.Sequential)] struct Basic {public IntPtr reserved,peb,a,b,pid,parent;}
 [StructLayout(LayoutKind.Sequential,Pack=4)] struct Info {public uint attr;public long creation,access,write;public uint volume,sizeHigh,sizeLow,links,indexHigh,indexLow;}
 [StructLayout(LayoutKind.Sequential)] struct TokenStatistics {public long tokenId,authenticationId,expirationTime;public int tokenType,impersonationLevel;public uint dynamicCharged,dynamicAvailable,groupCount,privilegeCount;public long modifiedId;}
 [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h,int cls,out Basic data,int size,out int length);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr h,out Info i);
 [DllImport("advapi32.dll",SetLastError=true)] static extern uint GetSecurityInfo(IntPtr h,int type,uint info,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr sd);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(IntPtr handle,StringBuilder path,uint length,uint flags);
 static bool IsVolumeRoot(IntPtr handle){Native.Need(GetFileInformationByHandle(handle,out Info info),"ROOT_HANDLE_INFO");if((info.attr&0x10)==0||(info.attr&0x400)!=0)return false;var path=new StringBuilder(32768);uint n=GetFinalPathNameByHandleW(handle,path,32768,0);Native.Need(n>0&&n<32768,"ROOT_FINAL_PATH");string expected=@"\\?\"+Path.GetPathRoot(Environment.GetFolderPath(Environment.SpecialFolder.System));return string.Equals(path.ToString(),expected,StringComparison.OrdinalIgnoreCase);}
 internal static bool SafeUntrustedMask(uint mask,bool ancestor,bool volumeRoot){uint dangerous=ancestor?0x500d0040u:0x500d0116u;if(ancestor&&volumeRoot)dangerous&=~0x10000u;return (mask&dangerous)==0;}
 [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr sd);
 public static void RequireElevated(ProcessPin p,string sid){Need(p.Elevated&&p.Sid==sid&&p.Integrity=="S-1-16-12288","PROTECTED_ELEVATED_SAME_USER_REQUIRED");using var id=WindowsIdentity.GetCurrent();Need(id.ImpersonationLevel==TokenImpersonationLevel.None,"IMPERSONATION_DENIED");}
 public static uint Parent(ProcessPin p){int status=NtQueryInformationProcess(p.Handle,0,out Basic b,Marshal.SizeOf<Basic>(),out int length);Need(status==0&&length==Marshal.SizeOf<Basic>()&&b.pid.ToInt64()==p.Pid,"PARENT_QUERY");long v=b.parent.ToInt64();Need(v>0&&v<=uint.MaxValue,"PARENT_RANGE");return (uint)v;}
 public static uint Session(ProcessPin p){Native.Need(Native.OpenProcessToken(p.Handle,8,out IntPtr token),"SESSION_TOKEN");try{IntPtr b=Marshal.AllocHGlobal(4);try{Native.Need(Native.GetTokenInformation(token,12,b,4,out uint n)&&n==4,"TOKEN_SESSION_QUERY");return unchecked((uint)Marshal.ReadInt32(b));}finally{Marshal.FreeHGlobal(b);}}finally{Native.CloseHandle(token);}}
 public static string Logon(ProcessPin p){Native.Need(Native.OpenProcessToken(p.Handle,8,out IntPtr token),"LOGON_TOKEN");try{Native.GetTokenInformation(token,10,IntPtr.Zero,0,out uint n);Need(n>=16&&n<65536,"LOGON_SIZE");IntPtr b=Marshal.AllocHGlobal((int)n);try{Native.Need(Native.GetTokenInformation(token,10,b,n,out uint used)&&used==n,"LOGON_QUERY");return Marshal.ReadInt64(b,8).ToString();}finally{Marshal.FreeHGlobal(b);}}finally{Native.CloseHandle(token);}}
 static T FixedTokenInfo<T>(IntPtr token,int cls,string reason) where T:struct {int size=Marshal.SizeOf<T>();IntPtr b=Marshal.AllocHGlobal(size);try{Native.Need(Native.GetTokenInformation(token,cls,b,(uint)size,out uint used)&&used==size,reason);return Marshal.PtrToStructure<T>(b);}finally{Marshal.FreeHGlobal(b);}}
 static string TokenSid(IntPtr token){Native.GetTokenInformation(token,1,IntPtr.Zero,0,out uint needed);Need(needed>=Marshal.SizeOf<IntPtr>()+4&&needed<=65536,"LINKED_SID_SIZE");IntPtr b=Marshal.AllocHGlobal((int)needed);try{Native.Need(Native.GetTokenInformation(token,1,b,needed,out uint used)&&used==needed,"LINKED_SID_QUERY");IntPtr sid=Marshal.ReadIntPtr(b);Need(sid!=IntPtr.Zero,"LINKED_SID_NULL");return new SecurityIdentifier(sid).Value;}finally{Marshal.FreeHGlobal(b);}}
 static string TokenId(long luid)=>unchecked(((uint)(luid>>32)).ToString("X8")+":"+((uint)luid).ToString("X8"));
 static LinkedPrimaryTokenFacts TokenFacts(IntPtr direct){var stats=FixedTokenInfo<TokenStatistics>(direct,10,"LINKED_STATS_QUERY");int elevation=FixedTokenInfo<int>(direct,18,"LINKED_ELEVATION_QUERY");int session=FixedTokenInfo<int>(direct,12,"LINKED_SESSION_QUERY");IntPtr linked=FixedTokenInfo<IntPtr>(direct,19,"LINKED_TOKEN_QUERY");Need(linked!=IntPtr.Zero,"LINKED_TOKEN_HANDLE");try{var other=FixedTokenInfo<TokenStatistics>(linked,10,"LINKED_PEER_STATS_QUERY");int otherElevation=FixedTokenInfo<int>(linked,18,"LINKED_PEER_ELEVATION_QUERY");int otherSession=FixedTokenInfo<int>(linked,12,"LINKED_PEER_SESSION_QUERY");return new LinkedPrimaryTokenFacts(TokenId(stats.tokenId),stats.authenticationId.ToString(),TokenSid(direct),unchecked((uint)session),elevation,stats.tokenType,TokenId(other.tokenId),other.authenticationId.ToString(),TokenSid(linked),unchecked((uint)otherSession),otherElevation,other.tokenType);}finally{Native.CloseHandle(linked);}}
 public static LinkedPrimaryTokenFacts ObserveLinkedPrimary(ProcessPin process){Native.Need(Native.OpenProcessToken(process.Handle,8,out IntPtr token),"LINKED_TOKEN_OPEN");try{var facts=TokenFacts(token);Need(facts.TokenId==process.TokenId&&facts.Sid==process.Sid,"LINKED_DIRECT_IDENTITY");return facts;}finally{Native.CloseHandle(token);}}
 public static void ValidateControllerFacts(uint shimParent,uint controllerPid,string shimSid,string controllerSid,string shimAuthenticationId,string controllerAuthenticationId,uint shimSession,uint controllerSession,uint coordinatorSession){Need(shimParent==controllerPid&&shimSid==controllerSid&&shimAuthenticationId==controllerAuthenticationId&&shimSession==controllerSession&&coordinatorSession==controllerSession,"CONTROLLER_PARENT_OR_LOGON");}
 public static LinkedPrimaryTokenRelationship RequireLinkedPrimaryPair(ProcessPin elevated,ProcessPin ordinary){var full=ObserveLinkedPrimary(elevated);var limited=ObserveLinkedPrimary(ordinary);ValidateLinkedPrimaryPair(full,limited);return new LinkedPrimaryTokenRelationship(full,limited);}
 public static void ValidateLinkedPrimaryPair(LinkedPrimaryTokenFacts full,LinkedPrimaryTokenFacts limited){Need(full!=null&&limited!=null&&full.ElevationType==2&&limited.ElevationType==3&&full.LinkedElevationType==3&&limited.LinkedElevationType==2&&full.TokenType==1&&limited.TokenType==1&&full.LinkedTokenType==2&&limited.LinkedTokenType==2,"LINKED_TOKEN_TYPE");Need(full.Sid==limited.Sid&&full.LinkedSid==limited.Sid&&limited.LinkedSid==full.Sid&&full.SessionId==limited.SessionId&&full.LinkedSessionId==limited.SessionId&&limited.LinkedSessionId==full.SessionId,"LINKED_TOKEN_IDENTITY");Need(!string.IsNullOrEmpty(full.TokenId)&&!string.IsNullOrEmpty(limited.TokenId)&&!string.IsNullOrEmpty(full.LinkedTokenId)&&!string.IsNullOrEmpty(limited.LinkedTokenId)&&!string.IsNullOrEmpty(full.AuthenticationId)&&!string.IsNullOrEmpty(limited.AuthenticationId)&&full.TokenId!=limited.TokenId&&full.LinkedTokenId!=full.TokenId&&limited.LinkedTokenId!=limited.TokenId&&full.AuthenticationId!=limited.AuthenticationId&&full.LinkedAuthenticationId==limited.AuthenticationId&&limited.LinkedAuthenticationId==full.AuthenticationId,"LINKED_TOKEN_RECIPROCAL");}
 public static string Identity(IntPtr handle){Native.Need(GetFileInformationByHandle(handle,out Info x),"FILE_IDENTITY");return x.volume+":"+x.indexHigh+":"+x.indexLow;}
 public static SafeFileHandle HoldDirectory(string path){PathCheck(path);var h=new SafeFileHandle(Native.CreateFileW(path,0x20080,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero),true);try{Need(!h.IsInvalid,"DIRECTORY_PIN");Native.Need(GetFileInformationByHandle(h.DangerousGetHandle(),out Info info),"HELD_DIRECTORY_INFO");Need((info.attr&0x10)!=0&&(info.attr&0x400)==0,"HELD_DIRECTORY_KIND_OR_REPARSE");return h;}catch{h.Dispose();throw;}}
 public static void SingleLink(IntPtr handle){Native.Need(GetFileInformationByHandle(handle,out Info x),"FILE_LINK_QUERY");Need(x.links==1&&(x.attr&0x400)==0,"FILE_LINK_OR_REPARSE");}
 public static string DirectoryIdentity(string path){using var h=HoldDirectory(path);return Identity(h.DangerousGetHandle());}
 public static void Acl(IntPtr handle,bool ancestor,bool systemObject=false){Native.Need(GetSecurityInfo(handle,1,5,out _,out _,out _,out _,out IntPtr sd)==0,"SECURITY_READ");try{uint n=GetSecurityDescriptorLength(sd);Need(n>0&&n<65536,"SECURITY_SIZE");byte[] bytes=new byte[n];Marshal.Copy(sd,bytes,0,(int)n);var d=new RawSecurityDescriptor(bytes,0);Need(d.DiscretionaryAcl!=null&&d.Owner!=null,"NULL_SECURITY");string owner=d.Owner.Value;Need(owner=="S-1-5-18"||owner=="S-1-5-32-544"||(ancestor||systemObject)&&owner=="S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464","PROTECTED_OWNER");bool root=ancestor&&IsVolumeRoot(handle);foreach(GenericAce ace in d.DiscretionaryAcl){if((ace.AceFlags&AceFlags.InheritOnly)!=0)continue;Need(ace is CommonAce,"ACL_COMPLEX_DENIED");var c=(CommonAce)ace;if(c.AceQualifier!=AceQualifier.AccessAllowed)continue;string sid=c.SecurityIdentifier.Value;bool trusted=sid=="S-1-5-18"||sid=="S-1-5-32-544"||(ancestor||systemObject)&&sid=="S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";Need(trusted||SafeUntrustedMask((uint)c.AccessMask,ancestor,root),"ORDINARY_PROTECTED_WRITE");}}finally{Native.LocalFree(sd);}}
 public sealed class Pins:IDisposable {
  readonly List<IDisposable> held=new List<IDisposable>();readonly HashSet<string> dirs=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  public void MutableAncestors(string path){for(string p=path;p!=null;p=Path.GetDirectoryName(p)){if(dirs.Add(p))held.Add(HoldDirectory(p));}}
  public void Ancestors(string path,string boundary){string current=path;while(current!=null){if(dirs.Add(current)){var pin=HoldDirectory(current);held.Add(pin);Acl(pin.DangerousGetHandle(),!current.Equals(boundary,StringComparison.OrdinalIgnoreCase)&&!current.StartsWith(boundary+"\\",StringComparison.OrdinalIgnoreCase));}current=Path.GetDirectoryName(current);}}
  public FileStream File(string path,string hash,long length,string boundary){Ancestors(Path.GetDirectoryName(path),boundary);var f=Hold(path);held.Add(f);SingleLink(f.SafeFileHandle.DangerousGetHandle());Acl(f.SafeFileHandle.DangerousGetHandle(),false);Need(f.Length==length&&length<=67108864&&H(ReadHeld(f,67108864))==hash,"PROTECTED_FILE_BINDING");return f;}
  public void Dispose(){for(int i=held.Count-1;i>=0;i--)held[i].Dispose();}
 }
}
public sealed class LinkedPrimaryTokenFacts {
 public string TokenId{get;} public string AuthenticationId{get;} public string Sid{get;} public uint SessionId{get;} public int ElevationType{get;} public int TokenType{get;} public string LinkedTokenId{get;} public string LinkedAuthenticationId{get;} public string LinkedSid{get;} public uint LinkedSessionId{get;} public int LinkedElevationType{get;} public int LinkedTokenType{get;}
 public LinkedPrimaryTokenFacts(string tokenId,string authenticationId,string sid,uint sessionId,int elevationType,int tokenType,string linkedTokenId,string linkedAuthenticationId,string linkedSid,uint linkedSessionId,int linkedElevationType,int linkedTokenType){TokenId=tokenId;AuthenticationId=authenticationId;Sid=sid;SessionId=sessionId;ElevationType=elevationType;TokenType=tokenType;LinkedTokenId=linkedTokenId;LinkedAuthenticationId=linkedAuthenticationId;LinkedSid=linkedSid;LinkedSessionId=linkedSessionId;LinkedElevationType=linkedElevationType;LinkedTokenType=linkedTokenType;}
}
public sealed class LinkedPrimaryTokenRelationship {
 public string Kind{get;}="kernel-reciprocal-full-limited";public LinkedPrimaryTokenFacts Elevated{get;}public LinkedPrimaryTokenFacts Ordinary{get;}
 public LinkedPrimaryTokenRelationship(LinkedPrimaryTokenFacts elevated,LinkedPrimaryTokenFacts ordinary){Elevated=elevated;Ordinary=ordinary;}
}
public interface IActivationState {
 int Next{get;} bool Stopped{get;} bool Reserved{get;} bool Complete{get;}
 void Reserve(int id);void Finish(int id,bool positive,bool confirmedKill);void Stop();
}
public sealed class ActivationState:IActivationState {
 public int Next{get;private set;}=1;public bool Stopped{get;private set;}public bool Reserved{get;private set;}
 public bool Complete=>Stopped&&!Reserved&&Next==4;
 public void Reserve(int id){Need(!Stopped&&!Reserved&&id==Next&&id<=3,"SLOT_REPLAY_OR_ORDER");Reserved=true;}
 public void Finish(int id,bool positive,bool confirmedKill){Need(Reserved&&!Stopped&&id==Next,"SLOT_STATE");if(!(id==2?confirmedKill:positive)){Stopped=true;return;}Reserved=false;Next++;if(Next==4)Stopped=true;}
 public void Stop(){Stopped=true;}
}
public sealed class TwoPositiveActivationState:IActivationState {
 public int Next{get;private set;}=1;public bool Stopped{get;private set;}public bool Reserved{get;private set;}
 public bool Complete=>Stopped&&!Reserved&&Next==3;
 public void Reserve(int id){Need(!Stopped&&!Reserved&&id==Next&&id<=2,"SLOT_REPLAY_OR_ORDER");Reserved=true;}
 public void Finish(int id,bool positive,bool confirmedKill){Need(Reserved&&!Stopped&&id==Next,"SLOT_STATE");if(!positive||confirmedKill){Stopped=true;return;}Reserved=false;Next++;if(Next==3)Stopped=true;}
 public void Stop(){Stopped=true;}
}
public sealed class WorkflowControllerPin:IDisposable {
 ProcessPin first;
 public void Admit(int id,ProcessPin current){Need(current!=null&&id>=1&&id<=2,"WORKFLOW_CONTROLLER_ORDER");if(id==1){Need(first==null,"WORKFLOW_CONTROLLER_ORDER");first=new ProcessPin(current.Pid);first.Match(current.Pid,current.Started,current.ImageSha256,current.Sid);Need(first.TokenId==current.TokenId&&ProtectedNative.Session(first)==ProtectedNative.Session(current),"WORKFLOW_CONTROLLER_A");return;}Need(first!=null&&!first.WaitExit(0),"WORKFLOW_CONTROLLER_A_EXITED");first.Match(current.Pid,current.Started,current.ImageSha256,current.Sid);Need(first.TokenId==current.TokenId&&ProtectedNative.Session(first)==ProtectedNative.Session(current),"WORKFLOW_CONTROLLER_A");}
 public void Dispose(){first?.Dispose();first=null;}
}
public sealed class ProtectedLedger:IDisposable {
 readonly FileStream lease;readonly string sink;int number;string previous=new string('0',64);public readonly IActivationState State;
 public ProtectedLedger(string sink):this(sink,false){}
 public ProtectedLedger(string sink,bool twoPositive){this.sink=sink;State=twoPositive?(IActivationState)new TwoPositiveActivationState():new ActivationState();lease=new FileStream(Path.Combine(sink,"activation.lock"),FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None);lease.Flush(true);}
 public void Record(string kind,object value){string raw=JsonSerializer.Serialize(new{sequence=++number,previous,kind,value});RetainRaw(Path.Combine(sink,number.ToString("D3")+"-ledger.json"),raw);previous=H(Encoding.UTF8.GetBytes(raw));}
 public void Reserve(int id,object binding){State.Reserve(id);try{Record("RESERVED",binding);}catch{State.Stop();throw;}}
 public void Finish(int id,bool good,bool killed,object terminal){Record("TERMINAL",terminal);State.Finish(id,good,killed);}
 public void Dispose(){lease.Dispose();}
}public sealed class AckFence {
 bool armed,cancelled,finished;
 public bool CanForward=>!cancelled&&!finished;
 public void Arm(){FiniteRelay.Need(CanForward&&!armed,"ACK_WINDOW");armed=true;}
 public void Accept(){FiniteRelay.Need(CanForward&&armed,"LATE_OR_EARLY_ACK");armed=false;}
 public void Cancel(){cancelled=true;armed=false;}
 public void Finish(){finished=true;armed=false;}
}public sealed class QueryOnlyToken:IDisposable {
 IntPtr token;public string TokenId{get;private set;}
 public QueryOnlyToken(ProcessPin process){Native.Need(Native.OpenProcessToken(process.Handle,8,out token),"OBSERVE_TOKEN_OPEN");try{IntPtr b=Info(10);try{TokenId=((uint)Marshal.ReadInt32(b,4)).ToString("X8")+":"+((uint)Marshal.ReadInt32(b)).ToString("X8");}finally{Marshal.FreeHGlobal(b);}FiniteRelay.Need(TokenId==process.TokenId,"OBSERVE_TOKEN_ID");}catch{Dispose();throw;}}
 IntPtr Info(int cls){Native.GetTokenInformation(token,cls,IntPtr.Zero,0,out uint n);FiniteRelay.Need(n>=8&&n<=65536,"OBSERVE_TOKEN_SIZE");IntPtr b=Marshal.AllocHGlobal((int)n);try{Native.Need(Native.GetTokenInformation(token,cls,b,n,out _),"OBSERVE_TOKEN_QUERY");return b;}catch{Marshal.FreeHGlobal(b);throw;}}
 public string SecurityState(){Native.Need(Native.LookupPrivilegeValueW(null,"SeSecurityPrivilege",out long wanted),"OBSERVE_PRIVILEGE_LUID");IntPtr b=Info(3);try{int count=Marshal.ReadInt32(b);for(int i=0;i<count;i++){int at=4+i*12;if(Marshal.ReadInt64(b,at)==wanted)return (Marshal.ReadInt32(b,at+8)&2)!=0?"enabled":"disabled";}return "absent";}finally{Marshal.FreeHGlobal(b);}}
 public void Dispose(){if(token!=IntPtr.Zero){Native.CloseHandle(token);token=IntPtr.Zero;}}
}public static class ProtectedCompletion {
 public static bool Eligible(bool processExited,uint? active,uint? total,bool ownedIoSettled,bool tasksSettled,bool consoleExited=false,bool consoleAdmitted=false)=>processExited&&active==0&&total==2&&ownedIoSettled&&tasksSettled&&consoleExited&&consoleAdmitted;
}public sealed class ConsoleRole:IDisposable {
 readonly List<IDisposable> held=new List<IDisposable>();public ProcessPin Pin{get;private set;} QueryOnlyToken token;public bool ExitObserved{get;private set;}public uint? ExitCode{get;private set;}public string InitialPrivilege{get;private set;}public string LastPrivilege{get;private set;}public string FileIdentity{get;private set;}public string SignatureThumbprint{get;private set;}public uint SessionId{get;private set;}public uint ParentPid{get;private set;}public string LogonId{get;private set;}
 public static string FixedPath=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"conhost.exe");
 internal static void ValidateRole(JsonElement role){Keys(role,"path","identity","sha256","signerThumbprint","verifierPath","verifierSha256");Need(string.Equals(Text(role,"path"),FixedPath,StringComparison.OrdinalIgnoreCase),"CONSOLE_FIXED_PATH");Hex(Text(role,"sha256"),64);Hex(Text(role,"verifierSha256"),64);Need(System.Text.RegularExpressions.Regex.IsMatch(Text(role,"identity"),"^[0-9]+:[0-9]+:[0-9]+$")&&System.Text.RegularExpressions.Regex.IsMatch(Text(role,"signerThumbprint"),"^[A-Fa-f0-9]{40}$"),"CONSOLE_ROLE_FORMAT");PathCheck(Text(role,"verifierPath"));}
 internal static void ValidateSignature(JsonElement evidence,JsonElement role){Keys(evidence,"path","identity","sha256","status","signatureType","signerSubject","signerThumbprint","verifierPath","verifierSha256");foreach(string field in new[]{"path","identity","sha256","signerThumbprint","verifierPath","verifierSha256"})Need(Text(evidence,field)==Text(role,field),"CONSOLE_SIGNATURE_BINDING");Need(Text(evidence,"status")=="Valid"&&Text(evidence,"signatureType")=="Catalog"&&Text(evidence,"signerSubject").StartsWith("CN=Microsoft Windows,",StringComparison.Ordinal),"CONSOLE_CATALOG_REQUIRED");}
 public static object InspectImage(){using var f=Hold(FixedPath);return new{path=FixedPath,identity=ProtectedNative.Identity(f.SafeFileHandle.DangerousGetHandle()),sha256=H(ReadHeld(f,67108864))};}
 public ConsoleRole(NativeChild child,ProcessPin coordinator,JsonElement role,JsonElement signature){try{ValidateRole(role);ValidateSignature(signature,role);SignatureThumbprint=Text(role,"signerThumbprint");string image=FixedPath;for(string at=Path.GetDirectoryName(image);at!=null;at=Path.GetDirectoryName(at)){var d=ProtectedNative.HoldDirectory(at);held.Add(d);ProtectedNative.Acl(d.DangerousGetHandle(),true,true);}var file=Hold(image);held.Add(file);ProtectedNative.Acl(file.SafeFileHandle.DangerousGetHandle(),false,true);FileIdentity=ProtectedNative.Identity(file.SafeFileHandle.DangerousGetHandle());Need(FileIdentity==Text(role,"identity")&&H(ReadHeld(file,67108864))==Text(role,"sha256"),"CONSOLE_IMAGE_BINDING");child.Observe(0);uint[] ids=child.JobPids();Need(child.TotalProcesses==2&&child.ActiveProcesses==2&&ids.Length==2&&ids.Contains(child.Pid),"EXACT_CONSOLE_JOB_ROLES");uint pid=ids.Single(x=>x!=child.Pid);Pin=new ProcessPin(pid);held.Add(Pin);Need(string.Equals(Pin.Image,image,StringComparison.OrdinalIgnoreCase)&&Pin.ImageSha256.Equals(Text(role,"sha256"),StringComparison.OrdinalIgnoreCase),"CONSOLE_PROCESS_IMAGE");ValidateFacts(child.Pin.Pid,ProtectedNative.Parent(Pin),child.Pin.Sid,Pin.Sid,child.Pin.TokenId,coordinator.TokenId,Pin.TokenId,child.Pin.Elevated,Pin.Elevated,child.Pin.Integrity,Pin.Integrity,ProtectedNative.Session(child.Pin),ProtectedNative.Session(Pin),ProtectedNative.Logon(child.Pin),ProtectedNative.Logon(Pin));SessionId=ProtectedNative.Session(Pin);LogonId=ProtectedNative.Logon(Pin);ParentPid=ProtectedNative.Parent(Pin);using(var actual=Hold(Pin.Image)){Need(ProtectedNative.Identity(actual.SafeFileHandle.DangerousGetHandle())==FileIdentity,"CONSOLE_PROCESS_FILE_IDENTITY");}token=new QueryOnlyToken(Pin);held.Add(token);InitialPrivilege=token.SecurityState();CheckPrivilege();}catch{Dispose();throw;}}
 public static void ValidateFacts(uint childPid,uint parent,string childSid,string sid,string childToken,string coordinatorToken,string consoleToken,bool childElevated,bool elevated,string childIntegrity,string integrity,uint childSession,uint session,string childLogon,string logon){Need(parent==childPid&&sid==childSid&&consoleToken!=childToken&&consoleToken!=coordinatorToken&&childToken!=coordinatorToken&&elevated==childElevated&&integrity==childIntegrity&&session==childSession&&logon==childLogon,"CONSOLE_PROCESS_ROLE");}
 public void CheckPrivilege(){LastPrivilege=token.SecurityState();Need(LastPrivilege=="disabled"||LastPrivilege=="absent","CONSOLE_PRIVILEGE_ENABLED");Need(LastPrivilege==InitialPrivilege,"CONSOLE_PRIVILEGE_DRIFT");}
 public void RecheckAlive(NativeChild child){Need(!Pin.WaitExit(0),"CONSOLE_EXITED_EARLY");using var fresh=new ProcessPin(Pin.Pid);fresh.Match(Pin.Pid,Pin.Started,Pin.ImageSha256,Pin.Sid);Need(fresh.TokenId==Pin.TokenId&&fresh.Elevated==Pin.Elevated&&fresh.Integrity==Pin.Integrity&&ProtectedNative.Parent(fresh)==child.Pid&&ProtectedNative.Session(fresh)==SessionId&&ProtectedNative.Logon(fresh)==LogonId,"CONSOLE_IDENTITY_DRIFT");child.Observe(0);Need(child.TotalProcesses==2&&child.ActiveProcesses==2&&child.JobPids().OrderBy(x=>x).SequenceEqual(new[]{child.Pid,Pin.Pid}.OrderBy(x=>x)),"CONSOLE_JOB_DRIFT");CheckPrivilege();}
 public void ObserveExit(int ms){ExitObserved=Pin.WaitExit(ms);if(ExitObserved){Native.Need(Native.GetExitCodeProcess(Pin.Handle,out uint code),"CONSOLE_EXIT_CODE");ExitCode=code;}CheckPrivilege();}
 public object Evidence()=>new{Pin.Pid,Started=Pin.Started.ToString(),Pin.Image,Pin.ImageSha256,FileIdentity,SignatureThumbprint,Pin.Sid,Pin.TokenId,Pin.Elevated,Pin.Integrity,SessionId,LogonId,ParentPid,InitialPrivilege,LastPrivilege,ExitObserved,ExitCode,tokenDestructionClaimed=false};
 public void Dispose(){for(int i=held.Count-1;i>=0;i--)held[i].Dispose();held.Clear();}
}
