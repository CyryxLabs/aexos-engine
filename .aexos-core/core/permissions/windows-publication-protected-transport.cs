using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Linq;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.Cryptography;
using Microsoft.Win32.SafeHandles;

namespace Aexos.FiniteTransport {
public static class Native {
 [StructLayout(LayoutKind.Sequential)] public struct SA { public int n; public IntPtr sd; public int inherit; }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct SI { public int cb; public string reserved,desktop,title; public uint x,y,xs,ys,xc,yc,fill,flags; public ushort show,reserved2; public IntPtr bytes,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] public struct SIX { public SI si; public IntPtr attributes; }
 [StructLayout(LayoutKind.Sequential)] public struct PI { public IntPtr process,thread; public uint pid,tid; }
 [StructLayout(LayoutKind.Sequential)] public struct LIMIT { public long processTime,jobTime; public uint flags; public UIntPtr min,max; public uint active; public UIntPtr affinity; public uint priority,scheduling; }
 [StructLayout(LayoutKind.Sequential)] public struct IO { public ulong a,b,c,d,e,f; }
 [StructLayout(LayoutKind.Sequential)] public struct EXT { public LIMIT basic; public IO io; public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
 [StructLayout(LayoutKind.Sequential)] public struct ACCOUNT { public long a,b,c,d; public uint page,total,active,terminated; }
 [DllImport("kernel32.dll",SetLastError=true)] public static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern uint WaitForSingleObject(IntPtr h,uint ms);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetProcessTimes(IntPtr h,out long create,out long exit,out long kernel,out long user);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool QueryFullProcessImageName(IntPtr h,uint flags,StringBuilder text,ref uint n);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool LookupPrivilegeValueW(string system,string name,out long luid);
 [DllImport("advapi32.dll",SetLastError=true)] public static extern bool OpenProcessToken(IntPtr h,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] public static extern bool GetTokenInformation(IntPtr h,int cls,IntPtr data,uint n,out uint need);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SA sa,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool SetHandleInformation(IntPtr h,uint mask,uint flags);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref UIntPtr size);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,UIntPtr size,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")] public static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool CreateProcessW(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref SIX si,out PI pi);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateJobObjectW(IntPtr sa,string name);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job,int cls,ref EXT data,uint n);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool QueryInformationJobObject(IntPtr job,int cls,out ACCOUNT data,uint n,IntPtr returned);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateNamedPipeW(string name,uint access,uint mode,uint max,uint outsize,uint insize,uint timeout,ref SA sa);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateFileW(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CancelIoEx(IntPtr h,IntPtr overlap);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool ConnectNamedPipe(IntPtr h,IntPtr overlap);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetNamedPipeClientProcessId(IntPtr h,out uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetNamedPipeServerProcessId(IntPtr h,out uint pid);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string s,uint rev,out IntPtr sd,out uint n);
 [DllImport("kernel32.dll")] public static extern IntPtr LocalFree(IntPtr h);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("kernel32.dll",SetLastError=true)] public static extern IntPtr OpenThread(uint access,bool inherit,uint id);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CancelSynchronousIo(IntPtr thread);
 public static void Need(bool ok,string code) { if(!ok) throw new InvalidOperationException(code+":"+Marshal.GetLastWin32Error()); }
 public static string Hash(string file) { using var s=File.OpenRead(file); return Convert.ToHexString(SHA256.HashData(s)); }
 public static string Quote(string s) { if(s.IndexOf('"')>=0||s.EndsWith("\\"))throw new Exception("ARGUMENT_DENIED");return "\""+s+"\""; }
}
public sealed class ProcessPin:IDisposable { private FileStream imagePin;
 public IntPtr Handle {get;private set;} public uint Pid {get;private set;} public long Started {get;private set;} public string Image {get;private set;} public string ImageSha256 {get;private set;} public string Sid {get;private set;} public string TokenId {get;private set;} public string Integrity {get;private set;} public bool Elevated {get;private set;} public string SeSecurityPrivilege {get;private set;}
 public ProcessPin(uint pid) { Pid=pid; Handle=Native.OpenProcess(0x00101000,false,pid); Native.Need(Handle!=IntPtr.Zero,"PROCESS_QUERY");try{Native.Need(Native.GetProcessTimes(Handle,out long start,out _,out _,out _),"PROCESS_TIMES");Started=start;var b=new StringBuilder(32768);uint n=32768;Native.Need(Native.QueryFullProcessImageName(Handle,0,b,ref n),"PROCESS_IMAGE");Image=b.ToString();imagePin=new FileStream(Image,FileMode.Open,FileAccess.Read,FileShare.Read);ImageSha256=Convert.ToHexString(SHA256.HashData(imagePin));Native.Need(Native.OpenProcessToken(Handle,8,out IntPtr token),"TOKEN_QUERY");try{Sid=TokenSid(token,1);Integrity=TokenSid(token,25);Elevated=TokenInt(token,20)!=0;TokenId=TokenLuid(token);SeSecurityPrivilege=SecurityPrivilege(token);}finally{Native.CloseHandle(token);}}catch{Dispose();throw;} }
 static IntPtr Info(IntPtr token,int cls){Native.GetTokenInformation(token,cls,IntPtr.Zero,0,out uint n);if(n==0||n>65536)throw new Exception("TOKEN_SIZE");IntPtr b=Marshal.AllocHGlobal((int)n);try{Native.Need(Native.GetTokenInformation(token,cls,b,n,out _),"TOKEN_INFO");return b;}catch{Marshal.FreeHGlobal(b);throw;}}
 static string SecurityPrivilege(IntPtr token){Native.Need(Native.LookupPrivilegeValueW(null,"SeSecurityPrivilege",out long wanted),"PRIVILEGE_LUID_QUERY");var b=Info(token,3);try{int count=Marshal.ReadInt32(b);for(int i=0;i<count;i++){int at=4+i*12;if(Marshal.ReadInt64(b,at)==wanted)return (Marshal.ReadInt32(b,at+8)&2)!=0?"enabled":"disabled";}return "absent";}finally{Marshal.FreeHGlobal(b);}}
 static string TokenSid(IntPtr t,int cls){var b=Info(t,cls);try{return new SecurityIdentifier(Marshal.ReadIntPtr(b)).Value;}finally{Marshal.FreeHGlobal(b);}}
 static int TokenInt(IntPtr t,int cls){var b=Info(t,cls);try{return Marshal.ReadInt32(b);}finally{Marshal.FreeHGlobal(b);}}
 static string TokenLuid(IntPtr t){var b=Info(t,10);try{return ((uint)Marshal.ReadInt32(b,4)).ToString("X8")+":"+((uint)Marshal.ReadInt32(b)).ToString("X8");}finally{Marshal.FreeHGlobal(b);}}
 public void Match(uint pid,long started,string imageHash,string sid){if(pid!=Pid||started!=Started||imageHash!=ImageSha256||sid!=Sid||Native.WaitForSingleObject(Handle,0)!=258)throw new Exception("PEER_PIN_MISMATCH");}
 public bool WaitExit(int ms){return Native.WaitForSingleObject(Handle,(uint)ms)==0;}
 public object Evidence()=>new{Pid,Started,Image,ImageSha256,Sid,TokenId,Integrity,Elevated,SeSecurityPrivilege};
 public void Dispose(){imagePin?.Dispose();if(Handle!=IntPtr.Zero){Native.CloseHandle(Handle);Handle=IntPtr.Zero;}}
}
public sealed class IoOwnership { private int unknown; public bool Settled=>System.Threading.Volatile.Read(ref unknown)==0; public T Run<T>(SafeFileHandle h,Func<T> work,int ms){try{return OwnedIo.Run(h,work,ms);}catch(Exception ex){if(ex.Message=="IO_OWNER_UNKNOWN_QUARANTINED"||ex.Message=="IO_OWNER_POISONED")System.Threading.Interlocked.Exchange(ref unknown,1);throw;}} }
public static class OwnedIo {
 static readonly System.Runtime.CompilerServices.ConditionalWeakTable<SafeFileHandle,object> poisoned=new System.Runtime.CompilerServices.ConditionalWeakTable<SafeFileHandle,object>();
 static readonly System.Collections.Generic.List<System.Threading.Thread> quarantine=new System.Collections.Generic.List<System.Threading.Thread>();
 public static T Run<T>(SafeFileHandle handle,Func<T> action,int timeoutMs){
 if(timeoutMs<1||timeoutMs>60000)throw new Exception("IO_TIMEOUT_RANGE");lock(poisoned){if(poisoned.TryGetValue(handle,out _))throw new Exception("IO_OWNER_POISONED");}
 bool held=false,cancelled=false;object gate=new object();IntPtr threadHandle=IntPtr.Zero;T result=default;Exception error=null;handle.DangerousAddRef(ref held);IntPtr stable=handle.DangerousGetHandle();
 var thread=new System.Threading.Thread(()=>{try{lock(gate){threadHandle=Native.OpenThread(1,false,Native.GetCurrentThreadId());Native.Need(threadHandle!=IntPtr.Zero,"IO_THREAD_PIN");if(cancelled)return;}result=action();}catch(Exception ex){error=ex;}finally{lock(gate){if(threadHandle!=IntPtr.Zero){Native.CloseHandle(threadHandle);threadHandle=IntPtr.Zero;}}if(held)handle.DangerousRelease();}}){IsBackground=true};
 try{thread.Start();}catch{if(held)handle.DangerousRelease();throw;}
 if(!thread.Join(timeoutMs)){lock(gate){cancelled=true;}long end=Environment.TickCount64+1000;bool done=false;do{lock(gate){Native.CancelIoEx(stable,IntPtr.Zero);if(threadHandle!=IntPtr.Zero)Native.CancelSynchronousIo(threadHandle);}done=thread.Join(20);}while(!done&&Environment.TickCount64<end);if(!done){lock(poisoned){if(!poisoned.TryGetValue(handle,out _))poisoned.Add(handle,new object());}lock(quarantine)quarantine.Add(thread);throw new Exception("IO_OWNER_UNKNOWN_QUARANTINED");}throw new Exception("IO_TIMEOUT_SETTLED");}
 if(error!=null)throw error;return result;
 }
}
public sealed class LocalPipe:IDisposable {
 public PipeStream Stream {get;private set;}
 public LocalPipe(string name){if(!System.Text.RegularExpressions.Regex.IsMatch(name,"^aexos-finite-[a-f0-9]{32}$"))throw new Exception("PIPE_NAME");string sid=WindowsIdentity.GetCurrent().User.Value;Native.Need(Native.ConvertStringSecurityDescriptorToSecurityDescriptorW("D:P(A;;0x0012019b;;;"+sid+")",1,out IntPtr sd,out _),"PIPE_SD");try{var sa=new Native.SA{n=Marshal.SizeOf<Native.SA>(),sd=sd,inherit=0};var h=Native.CreateNamedPipeW("\\\\.\\pipe\\"+name,3|0x80000|0x40000000,8,1,65536,65536,0,ref sa);Native.Need(h!=new IntPtr(-1),"PIPE_CREATE");Stream=new NamedPipeServerStream(PipeDirection.InOut,true,false,new SafePipeHandle(h,true));}finally{Native.LocalFree(sd);}}
 public void Accept(int ms){using var c=new System.Threading.CancellationTokenSource(ms);((NamedPipeServerStream)Stream).WaitForConnectionAsync(c.Token).GetAwaiter().GetResult();}
 public ProcessPin PinClient(ProcessPin admitted){Native.Need(Native.GetNamedPipeClientProcessId(Stream.SafePipeHandle.DangerousGetHandle(),out uint pid),"PIPE_CLIENT_PID");return Compare(pid,admitted);}
 static ProcessPin Compare(uint pid,ProcessPin admitted){var pin=new ProcessPin(pid);try{admitted.Match(pin.Pid,pin.Started,pin.ImageSha256,pin.Sid);if(pin.TokenId!=admitted.TokenId||pin.Elevated!=admitted.Elevated||pin.Integrity!=admitted.Integrity)throw new Exception("PEER_TOKEN_CHANGED");return pin;}catch{pin.Dispose();throw;}}
 public static PipeStream Connect(string name){if(!System.Text.RegularExpressions.Regex.IsMatch(name,"^aexos-finite-[a-f0-9]{32}$"))throw new Exception("PIPE_NAME");var h=Native.CreateFileW("\\\\.\\pipe\\"+name,0x0012019b,0,IntPtr.Zero,3,0x40000000,IntPtr.Zero);Native.Need(h!=new IntPtr(-1),"PIPE_CLIENT_OPEN");return new NamedPipeClientStream(PipeDirection.InOut,true,true,new SafePipeHandle(h,true));}
 public static ProcessPin PinServer(PipeStream stream,ProcessPin admitted){Native.Need(Native.GetNamedPipeServerProcessId(stream.SafePipeHandle.DangerousGetHandle(),out uint pid),"PIPE_SERVER_PID");return Compare(pid,admitted);}
 public void Dispose(){Stream?.Dispose();}
}
public static class Frame {
 public const int Limit=65536;
 public static byte[] Encode(string json){byte[] body=new UTF8Encoding(false,true).GetBytes(json);if(body.Length>Limit)throw new Exception("FRAME_LIMIT");return Encoding.ASCII.GetBytes(body.Length+"\n").Concat(body).ToArray();}
 public static string Read(Stream s){int n=0,digits=0;while(true){int b=s.ReadByte();if(b<0)throw new Exception("FRAME_EOF");if(b==10)break;if(b<48||b>57||++digits>5)throw new Exception("FRAME_HEADER");n=checked(n*10+b-48);}if(digits==0||n<2||n>Limit)throw new Exception("FRAME_SIZE");var data=new byte[n];s.ReadExactly(data);return new UTF8Encoding(false,true).GetString(data);}
 internal static async Task<string> ReadPipe(PipeStream s,System.Threading.CancellationToken ct){byte[] one=new byte[1];int n=0,digits=0;while(true){int read=await s.ReadAsync(one.AsMemory(),ct);if(read!=1)throw new Exception("FRAME_EOF");int b=one[0];if(b==10)break;if(b<48||b>57||++digits>5)throw new Exception("FRAME_HEADER");n=checked(n*10+b-48);}if(digits==0||n<2||n>Limit)throw new Exception("FRAME_SIZE");var data=new byte[n];await s.ReadExactlyAsync(data.AsMemory(),ct);return new UTF8Encoding(false,true).GetString(data);}
 public static string ReadBounded(PipeStream s,int timeoutMs){using var c=new System.Threading.CancellationTokenSource(timeoutMs);return ReadPipe(s,c.Token).GetAwaiter().GetResult();}
 public static string ReadBounded(FileStream s,int timeoutMs)=>OwnedIo.Run(s.SafeFileHandle,()=>Read(s),timeoutMs);
 public static void Write(Stream s,string json){var b=Encode(json);if(s is PipeStream pipe){using var c=new System.Threading.CancellationTokenSource(5000);pipe.WriteAsync(b.AsMemory(),c.Token).AsTask().GetAwaiter().GetResult();}else if(s is FileStream f)OwnedIo.Run(f.SafeFileHandle,()=>{f.Write(b);f.Flush();return true;},5000);else{s.Write(b);s.Flush();}}
 public static JsonDocument Parse(string json){var doc=JsonDocument.Parse(json,new JsonDocumentOptions{MaxDepth=8});if(doc.RootElement.ValueKind!=JsonValueKind.Object){doc.Dispose();throw new Exception("FRAME_OBJECT");}string[] allowed={"session","slot","seq","type","manifest","payload"};var seen=new System.Collections.Generic.HashSet<string>();foreach(var p in doc.RootElement.EnumerateObject()){if(!allowed.Contains(p.Name)||!seen.Add(p.Name)){doc.Dispose();throw new Exception("FRAME_KEYS");}}if(seen.Count!=6){doc.Dispose();throw new Exception("FRAME_KEYS");}return doc;}
}
public sealed class RequestBinding {
 readonly string exact; public string Digest {get;private set;}
 public RequestBinding(string root,string action,string contentHash,string runtimeHash){if(!Path.IsPathFullyQualified(root)||action!="fixture-echo"||!System.Text.RegularExpressions.Regex.IsMatch(contentHash,"^[A-Fa-f0-9]{64}$")||!System.Text.RegularExpressions.Regex.IsMatch(runtimeHash,"^[A-Fa-f0-9]{64}$"))throw new Exception("MANIFEST_INVALID");exact=JsonSerializer.Serialize(new{root,action,contentHash,runtimeHash});Digest=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(exact)));}
 public string Payload()=>exact;
 public void Validate(string payload){if(payload!=exact)throw new Exception("MANIFEST_PAYLOAD_MISMATCH");}
}
public sealed class FiniteState {
 readonly string session,manifest; readonly long deadline; int seq=1,slot=1; string phase="REQUEST";
 public FiniteState(string session,string manifest,int ttlMs){if(ttlMs<1||ttlMs>60000)throw new Exception("TTL");this.session=session;this.manifest=manifest;deadline=Environment.TickCount64+ttlMs;}
 public string Consume(string text){using var d=Frame.Parse(text);var x=d.RootElement;if(Environment.TickCount64>=deadline)throw new Exception("EXPIRED");if(x.GetProperty("session").GetString()!=session||x.GetProperty("manifest").GetString()!=manifest||x.GetProperty("slot").GetInt32()!=slot||x.GetProperty("seq").GetInt32()!=seq)throw new Exception("BINDING_OR_REPLAY");string type=x.GetProperty("type").GetString();if((phase=="REQUEST"&&type!="request")||(phase=="ACK"&&type!="ack")||phase=="CONSUMED")throw new Exception("PHASE");seq++;phase=phase=="REQUEST"?"ACK":"CONSUMED";return phase;}
}
public sealed class NativeChild:IDisposable {
 FileStream scriptPin,executablePin; long outputBytes; IntPtr process,job; public uint Pid {get;private set;} public ProcessPin Pin {get;private set;} public Stream Input,Output,Error; public Task<string> ErrorCapture {get;private set;} public string CoordinatorTokenId {get;private set;} public bool AssignedBeforeResume {get;private set;} public bool TokenIdsDistinct {get;private set;} public bool TerminationObserved {get;private set;} public uint? ExitCode {get;private set;} public uint? ActiveProcesses {get;private set;} public uint? TotalProcesses {get;private set;} public readonly IoOwnership Ownership=new IoOwnership(); public bool OwnedIoSettled=>Ownership.Settled;
 public NativeChild(string executable,string executableHash,string script,string scriptHash,string working):this(executable,executableHash,script,scriptHash,working,null){}
 internal NativeChild(string executable,string executableHash,string script,string scriptHash,string working,ProtectedChildPolicy policy){
 if(!Path.IsPathFullyQualified(working))throw new Exception("WORKING_PATH");
 IntPtr ri=IntPtr.Zero,wi=IntPtr.Zero,ro=IntPtr.Zero,wo=IntPtr.Zero,re=IntPtr.Zero,we=IntPtr.Zero,attrs=IntPtr.Zero,list=IntPtr.Zero,environment=IntPtr.Zero;Native.PI pi=new Native.PI();bool made=false,attributesInitialized=false;
 try{scriptPin=new FileStream(script,FileMode.Open,FileAccess.Read,FileShare.Read);executablePin=new FileStream(executable,FileMode.Open,FileAccess.Read,FileShare.Read);if(Convert.ToHexString(SHA256.HashData(scriptPin))!=scriptHash||Convert.ToHexString(SHA256.HashData(executablePin))!=executableHash)throw new Exception("FIXED_INPUT_HASH");using var me=new ProcessPin((uint)Environment.ProcessId);CoordinatorTokenId=me.TokenId;var sa=new Native.SA{n=Marshal.SizeOf<Native.SA>(),inherit=1};Native.Need(Native.CreatePipe(out ri,out wi,ref sa,0),"STDIN");Native.Need(Native.CreatePipe(out ro,out wo,ref sa,0),"STDOUT");Native.Need(Native.CreatePipe(out re,out we,ref sa,0),"STDERR");foreach(var h in new[]{wi,ro,re})Native.Need(Native.SetHandleInformation(h,1,0),"NO_INHERIT");UIntPtr size=UIntPtr.Zero;Native.InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);attrs=Marshal.AllocHGlobal((int)size);Native.Need(Native.InitializeProcThreadAttributeList(attrs,1,0,ref size),"ATTRIBUTE_INIT");attributesInitialized=true;list=Marshal.AllocHGlobal(IntPtr.Size*3);Marshal.WriteIntPtr(list,0,ri);Marshal.WriteIntPtr(list,IntPtr.Size,wo);Marshal.WriteIntPtr(list,IntPtr.Size*2,we);Native.Need(Native.UpdateProcThreadAttribute(attrs,0,new IntPtr(0x20002),list,(UIntPtr)(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero),"HANDLE_LIST");
 job=Native.CreateJobObjectW(IntPtr.Zero,null);Native.Need(job!=IntPtr.Zero,"JOB_CREATE");var limits=new Native.EXT{basic=new Native.LIMIT{flags=policy==null?0x2000u:0x2008u,active=policy==null?0u:2u}};Native.Need(Native.SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf<Native.EXT>()),"JOB_LIMIT");
 string env="SystemRoot=C:\\Windows\0TEMP="+working+"\0TMP="+working+"\0WINDIR=C:\\Windows\0\0";environment=Marshal.StringToHGlobalUni(env);var si=new Native.SIX{si=new Native.SI{cb=Marshal.SizeOf<Native.SIX>(),flags=0x100,input=ri,output=wo,error=we},attributes=attrs};
 Native.Need(Native.CreateProcessW(executable,new StringBuilder(Native.Quote(executable)+" -NoLogo -NoProfile -NonInteractive -File "+Native.Quote(script)),IntPtr.Zero,IntPtr.Zero,true,0x08000000|0x00080000|0x400|4,environment,working,ref si,out pi),"CREATE_SUSPENDED");made=true;process=pi.process;Pid=pi.pid;
 Native.Need(Native.AssignProcessToJobObject(job,process),"JOB_ASSIGN");AssignedBeforeResume=true;Pin=new ProcessPin(Pid);TokenIdsDistinct=Pin.TokenId!=CoordinatorTokenId;if(!TokenIdsDistinct)throw new Exception("TOKEN_ID_NOT_DISTINCT");if(policy==null){if(Pin.Elevated||me.Elevated)throw new Exception("ORDINARY_CHILD_REQUIRED");}else policy.Check(me,Pin);Native.Need(Native.ResumeThread(pi.thread)!=uint.MaxValue,"RESUME");Input=new FileStream(new SafeFileHandle(wi,true),FileAccess.Write);wi=IntPtr.Zero;Output=new FileStream(new SafeFileHandle(ro,true),FileAccess.Read);ro=IntPtr.Zero;Error=new FileStream(new SafeFileHandle(re,true),FileAccess.Read);re=IntPtr.Zero;if(policy==null)StartErrorCapture();
 }catch{bool orphan=false;try{if(made){Native.TerminateProcess(pi.process,91);orphan=Native.WaitForSingleObject(pi.process,5000)!=0;}}finally{Dispose();}if(orphan)throw new Exception("SUSPENDED_ORPHAN_UNKNOWN");throw;}finally{if(pi.thread!=IntPtr.Zero)Native.CloseHandle(pi.thread);foreach(var h in new[]{ri,wi,ro,wo,re,we})if(h!=IntPtr.Zero)Native.CloseHandle(h);if(attrs!=IntPtr.Zero){if(attributesInitialized)Native.DeleteProcThreadAttributeList(attrs);Marshal.FreeHGlobal(attrs);}if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list);if(environment!=IntPtr.Zero)Marshal.FreeHGlobal(environment);}
 }
 public void StartErrorCapture(){if(ErrorCapture!=null)throw new Exception("STDERR_ALREADY_STARTED"); ErrorCapture=Task.Run(()=>{using var b=new MemoryStream();while(true){int x=Error.ReadByte();if(x<0)return new UTF8Encoding(false,true).GetString(b.ToArray());if(b.Length>=8192){Native.TerminateJobObject(job,93);throw new Exception("STDERR_LIMIT");}b.WriteByte((byte)x);}});
 }
 public string ReadLine(int timeoutMs,int limit=65536){try{return Ownership.Run(((FileStream)Output).SafeFileHandle,()=>{using var b=new MemoryStream();while(true){int x=Output.ReadByte();if(x>=0&&System.Threading.Interlocked.Increment(ref outputBytes)>262144)throw new Exception("STDOUT_LIMIT");if(x<0)throw new Exception("CHILD_EOF");if(x==10)return new UTF8Encoding(false,true).GetString(b.ToArray()).TrimEnd('\r');if(b.Length>=limit)throw new Exception("OUTPUT_LIMIT");b.WriteByte((byte)x);}},timeoutMs);}catch{CancelAndWait();throw;}}
 public void WriteRequest(byte[] bytes,int timeoutMs){if(bytes==null||bytes.Length>6291456)throw new Exception("REQUEST_LIMIT");try{Ownership.Run(((FileStream)Input).SafeFileHandle,()=>{Input.Write(bytes);Input.Flush();return true;},timeoutMs);}catch{CancelAndWait();throw;}}
 public void WriteLine(string text){if(Encoding.UTF8.GetByteCount(text)>65536)throw new Exception("INPUT_LIMIT");var b=Encoding.UTF8.GetBytes(text+"\n");WriteRequest(b,5000);}
 public void CancelAndWait(){if(job==IntPtr.Zero)return;Native.Need(Native.TerminateJobObject(job,92),"JOB_TERMINATE");Observe(5000);if(!TerminationObserved||ActiveProcesses!=0)throw new Exception("TERMINATION_UNKNOWN");}
 [DllImport("kernel32.dll",SetLastError=true,EntryPoint="QueryInformationJobObject")] static extern bool QueryPids(IntPtr job,int cls,IntPtr buffer,uint bytes,out uint returned);
 public uint[] JobPids(){IntPtr b=Marshal.AllocHGlobal(136);try{Native.Need(QueryPids(job,3,b,136,out _),"JOB_PID_LIST");int n=Marshal.ReadInt32(b,4);if(n<0||n>16)throw new Exception("JOB_PID_BOUND");var pids=new uint[n];for(int i=0;i<n;i++)pids[i]=checked((uint)Marshal.ReadIntPtr(b,8+i*IntPtr.Size).ToInt64());return pids;}finally{Marshal.FreeHGlobal(b);}}
 public void Observe(int ms){TerminationObserved=Native.WaitForSingleObject(process,(uint)ms)==0;if(TerminationObserved){Native.Need(Native.GetExitCodeProcess(process,out uint e),"EXIT_CODE");ExitCode=e;}Native.Need(Native.QueryInformationJobObject(job,1,out Native.ACCOUNT account,(uint)Marshal.SizeOf<Native.ACCOUNT>(),IntPtr.Zero),"JOB_ACCOUNT");ActiveProcesses=account.active;TotalProcesses=account.total;}
 public object Evidence()=>new{Pid,AssignedBeforeResume,TokenIdsDistinct,CoordinatorTokenId,child=Pin?.Evidence(),TerminationObserved,ExitCode,ActiveProcesses,TotalProcesses,OwnedIoSettled,constructorPrivilegeAdjusted=false,restorationObserved=false,tokenDestructionClaimed=false};
 public void Dispose(){if(job!=IntPtr.Zero){Native.CloseHandle(job);job=IntPtr.Zero;}Input?.Dispose();Output?.Dispose();Error?.Dispose();Pin?.Dispose();scriptPin?.Dispose();executablePin?.Dispose();if(process!=IntPtr.Zero){Native.CloseHandle(process);process=IntPtr.Zero;}}
}
}














