'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { SOURCE, inspectNativeCandidateIdentity } = require(path.resolve(
  __dirname, '../../../.aexos-core/core/permissions/native-publication-support',
));

// Exact compiled product methods and synthetic fresh retained states qualify the
// record-reading primitive without broker/launcher or full-security admission.
// All fixtures are ordinary GUID directories and deliberately retained.
const probe = String.raw`param([string]$Source,[string]$FixtureRoot)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($Source)))
Add-Type -TypeDefinition @'
using System;using System.IO;using System.Text;using System.Text.Json;using System.Collections.Generic;using System.Linq;using System.Reflection;using Microsoft.Win32.SafeHandles;
public static class JournalReadProbe {
 static Type H; static BindingFlags F=BindingFlags.NonPublic|BindingFlags.Public|BindingFlags.Static|BindingFlags.Instance;
 static object Call(string n,params object[] a){try{return H.GetMethod(n,F).Invoke(null,a);}catch(TargetInvocationException e){throw e.InnerException;}}
 static SafeFileHandle Open(SafeFileHandle p,string n,bool dir,uint disposition,uint access,uint share,byte[] sd=null)=>(SafeFileHandle)Call("Relative",p,n,dir,disposition,access,share,sd);
 static SafeFileHandle Root(string p)=>(SafeFileHandle)Call("CreateFileW",p,0x1200A1u,3u,IntPtr.Zero,3u,0x02200000u,IntPtr.Zero);
 static string Id(SafeFileHandle h)=>(string)Call("Identity",h);static string Hash(byte[] b)=>(string)Call("Hash",b);
 static string Denial(Exception e){return (string)e.GetType().GetField("Code",F)?.GetValue(e)??e.GetType().Name;}
 static object Tx()=>Activator.CreateInstance(H.GetNestedType("Transaction",F),true);
 static JsonElement Json(object o)=>JsonSerializer.SerializeToElement(o);
 static List<SafeFileHandle> Handles()=>new List<SafeFileHandle>();static void Close(List<SafeFileHandle> h){for(int i=h.Count-1;i>=0;i--)h[i].Dispose();}
 sealed class Fixture{public string Root,Id,Directory;public Dictionary<string,object> Request;}
 static Fixture Setup(string parent){
  var x=new Fixture{Root=Path.Combine(parent,Guid.NewGuid().ToString("N")),Id=Guid.NewGuid().ToString("N")};Directory.CreateDirectory(x.Root);x.Directory=Path.Combine(x.Root,".aexos-transactions",x.Id);
  using var root=Root(x.Root);byte[] sd=(byte[])Call("PrivateSecurity");var held=Handles();
  try{using var ledger=Open(root,".aexos-transactions",true,2,0x1200A1,3,sd);using var dir=Open(ledger,x.Id,true,2,0x1200A1,3,sd);
   var reservation=JsonSerializer.SerializeToUtf8Bytes(new{version=1,transactionId=x.Id,rootIdentity=Id(root),reservedBytes=1024});var rh=(SafeFileHandle)Call("PublishRecord",dir,"reservation.json",reservation,sd,held);
   var authority=new{agentId="ordinary-probe",task="journal-noninterference",story=new{id="AEX-4.28"}};
   var prepared=new{authority,rootIdentity=Id(root),parentIdentity=Id(root),target="target.bin",ancestry=new[]{Id(root)},helperSha256=new string('a',64),launcherSha256=new string('b',64),runtimeIdentity=new{probe="ordinary-private-method"},ledgerIdentity=Id(ledger),transactionIdentity=Id(dir),reservationIdentity=Id(rh),reservationSha256=Hash(reservation),stageName=".aexos-"+x.Id+".stage"};
   byte[] journal=JsonSerializer.SerializeToUtf8Bytes(prepared);var jh=(SafeFileHandle)Call("PublishRecord",dir,"prepared.json",journal,sd,held);
   byte[] one=JsonSerializer.SerializeToUtf8Bytes(new{version=1,transactionId=x.Id,phase="ORIGINAL_PARKED",previous=Hash(journal)});Call("PublishRecord",dir,"001-ORIGINAL_PARKED.json",one,sd,held);
   byte[] two=JsonSerializer.SerializeToUtf8Bytes(new{version=1,transactionId=x.Id,phase="PUBLISHED",previous=Hash(one)});Call("PublishRecord",dir,"002-PUBLISHED.json",two,sd,held);
   var anchor=new{transactionId=x.Id,prepared,preparedIdentity=Id(jh),preparedSha256=Hash(journal)};
   x.Request=new Dictionary<string,object>{{"operation","guarded-recover"},{"target","target.bin"},{"trustedReceipt",anchor},{"authority",authority},{"helperSha256",prepared.helperSha256},{"launcherSha256",prepared.launcherSha256},{"runtimeIdentity",prepared.runtimeIdentity}};
  }finally{Close(held);}
  File.WriteAllText(Path.Combine(x.Root,"target.bin"),"occupied destination sentinel");
  foreach(string file in Directory.GetFiles(x.Directory)){File.SetLastAccessTimeUtc(file,new DateTime(2020,1,2,3,4,5,DateTimeKind.Utc));File.SetLastWriteTimeUtc(file,new DateTime(2020,2,3,4,5,6,DateTimeKind.Utc));}
  return x;
 }
 static Dictionary<string,string> Observe(Fixture x){var result=new Dictionary<string,string>();using var root=Root(x.Root);using var ledger=Open(root,".aexos-transactions",true,1,0x1200A1,3);using var dir=Open(ledger,x.Id,true,1,0x1200A1,3);
  foreach(string name in Directory.GetFiles(x.Directory).Select(Path.GetFileName).OrderBy(v=>v)){
   // This fixed mask already invokes production Relative's immediate per-handle suppression.
   using var h=Open(dir,name,false,1,0x80120180,3);object info=Call("Info",h);var t=info.GetType();var a=(System.Runtime.InteropServices.ComTypes.FILETIME)t.GetField("Access",F).GetValue(info);var w=(System.Runtime.InteropServices.ComTypes.FILETIME)t.GetField("Write",F).GetValue(info);var c=(System.Runtime.InteropServices.ComTypes.FILETIME)t.GetField("Creation",F).GetValue(info);
   string Ft(System.Runtime.InteropServices.ComTypes.FILETIME f)=>unchecked(((long)(uint)f.dwHighDateTime<<32)|(uint)f.dwLowDateTime).ToString();
   result[name+".access"]=Ft(a);result[name+".write"]=Ft(w);result[name+".creation"]=Ft(c);result[name+".attributes"]=t.GetField("Attr",F).GetValue(info).ToString();result[name+".identity"]=Id(h);result[name+".hash"]=Hash((byte[])Call("Read",h,65536));
  }
  using var target=Open(root,"target.bin",false,1,0x80120180,3);result["target.hash"]=Hash((byte[])Call("Read",target,65536));result["root.namespace"]=string.Join("|",Directory.GetFileSystemEntries(x.Root).Select(Path.GetFileName).OrderBy(v=>v));result["journal.namespace"]=string.Join("|",Directory.GetFileSystemEntries(x.Directory).Select(Path.GetFileName).OrderBy(v=>v));return result;
 }
 static string Operation(Fixture x,bool accounting){using var root=Root(x.Root);var held=Handles();TextReader input=Console.In;TextWriter output=Console.Out;try{Console.SetOut(new StringWriter());Console.SetIn(new StringReader(accounting?"{\"type\":\"continue\"}\n{\"type\":\"continue\"}\n{\"type\":\"continue\"}\n{\"type\":\"stop\"}\n":"{\"type\":\"continue\"}\n"));
   if(accounting){var req=new{operation="guarded-create",contentBase64="eA=="};Call("ExecuteTransaction",Json(req),root,root,"new.bin",Id(root),Id(root),0u,held,Tx());}
   else Call("Recover",Json(x.Request),root,root,"target.bin",Id(root),Id(root),new List<string>{Id(root)},held,Tx());return "UNEXPECTED_SUCCESS";
  }catch(Exception e){return Denial(e);}finally{Close(held);Console.SetIn(input);Console.SetOut(output);}}
 static object Case(string parent,bool accounting,string tamper){var x=Setup(parent);if(tamper=="content")File.AppendAllText(Path.Combine(x.Directory,"prepared.json")," ");if(tamper=="timestamp")File.SetLastAccessTimeUtc(Path.Combine(x.Directory,"prepared.json"),new DateTime(2021,3,4,5,6,7,DateTimeKind.Utc));
  var before=Observe(x);string code=Operation(x,accounting);var after=Observe(x);var changed=before.Keys.Where(k=>before[k]!=after[k]).ToArray();return new{accounting,tamper,code,fixture=x.Root,before,after,changed,bytesAndNamespacePreserved=changed.All(k=>k.EndsWith(".access"))};}
 public static string Run(Type helper,string parent){H=helper;Directory.CreateDirectory(parent);var recovery=Case(parent,false,null);var accounting=Case(parent,true,null);var tampered=Case(parent,false,"content");
  // Metadata differences remain visible; suppression preserves a real external timestamp, never restores a baseline.
  var x=Setup(parent);var old=Observe(x);File.SetLastAccessTimeUtc(Path.Combine(x.Directory,"prepared.json"),new DateTime(2021,3,4,5,6,7,DateTimeKind.Utc));var changed=Observe(x);string code=Operation(x,false);var after=Observe(x);
  return JsonSerializer.Serialize(new{scope="exact compiled production source; private Recover and ExecuteTransaction invocation; synthetic private retained fixtures, ordinary ACLs, event acknowledgements; no public broker/launcher/full-security/privilege proof",recovery,accounting,tampered,metadataChange=new{detected=old["prepared.json.access"]!=changed["prepared.json.access"],preserved=after["prepared.json.access"]==changed["prepared.json.access"],code},privilegeCalls=false});}
}

'@
[JournalReadProbe]::Run([AexosPublication],$FixtureRoot)
`;
const windowsDescribe = process.platform === 'win32' ? describe : describe.skip;
windowsDescribe('native retained journal-read noninterference', () => {
  test('accounting and rejected recovery preserve record bytes, namespace and exact metadata', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-journal-read-'));
    const script = path.join(directory, 'probe.ps1');
    fs.writeFileSync(script, probe);
    const result = spawnSync(inspectNativeCandidateIdentity().executable, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-File', script,
      '-Source', SOURCE, '-FixtureRoot', path.join(directory, 'fixtures'),
    ], { encoding: 'utf8', timeout: 40_000, maxBuffer: 256 * 1024 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const observed = JSON.parse(result.stdout);
    expect(observed.recovery.code).toBe('NATIVE_2');
    expect(observed.accounting.code).toBe('BARRIER_NOT_ACKNOWLEDGED');
    expect(observed.tampered.code).toBe('JOURNAL_ANCHOR_MISMATCH');
    for (const operation of [observed.recovery, observed.accounting, observed.tampered]) {
      expect(operation.changed).toEqual([]);
      expect(operation.bytesAndNamespacePreserved).toBe(true);
      expect(operation.after).toEqual(operation.before);
    }
    expect(observed.metadataChange).toEqual({ detected: true, preserved: true, code: 'NATIVE_2' });
    expect(observed.privilegeCalls).toBe(false);
  }, 60_000);
});
