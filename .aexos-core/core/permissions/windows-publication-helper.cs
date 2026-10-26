// AEX-4.28 candidate. No supported production tuple is enabled by this source.
using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Win32.SafeHandles;

public static class AexosPublication {
    const uint DirectoryAccess = 0x001200A1; // READ_CONTROL, SYNCHRONIZE, LIST, TRAVERSE, READ_ATTRIBUTES
    const uint FileAccessMask = 0xC01F0180; // data read/write, DELETE, READ_CONTROL, WRITE_DAC/OWNER, WRITE_ATTRIBUTES
    const int MaxContent = 4194304;
    const int MaxRecord = 65536;
    [StructLayout(LayoutKind.Sequential)] struct US { public ushort Length, MaximumLength; public IntPtr Buffer; }
    [StructLayout(LayoutKind.Sequential)] struct OA { public uint Length; public IntPtr Root, Name; public uint Attributes; public IntPtr Security, Quality; }
    [StructLayout(LayoutKind.Sequential)] struct IOSB { public IntPtr Status; public UIntPtr Information; }
    [StructLayout(LayoutKind.Sequential)] struct INFO {
        public uint Attr; public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
        public uint Volume, SizeHi, SizeLo, Links, IndexHi, IndexLo;
    }
    [StructLayout(LayoutKind.Sequential)] struct BASIC { public long Creation, Access, Write, Change; public uint Attributes; }
    [StructLayout(LayoutKind.Sequential)] struct RENAME { public uint Flags; public IntPtr RootDirectory; public uint FileNameLength; public ushort FirstChar; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint a,uint s,IntPtr sa,uint d,uint f,IntPtr t);
    [DllImport("ntdll.dll")] static extern int NtCreateFile(out SafeFileHandle h,uint access,ref OA oa,out IOSB io,IntPtr allocation,uint attr,uint share,uint disposition,uint options,IntPtr ea,uint ealen);
    [DllImport("ntdll.dll")] static extern int NtSetInformationFile(SafeFileHandle h,out IOSB io,IntPtr b,uint n,int c);
    [DllImport("ntdll.dll")] static extern int NtQueryInformationFile(SafeFileHandle h,out IOSB io,IntPtr b,uint n,int c);
    [DllImport("ntdll.dll")] static extern int NtQueryDirectoryFile(SafeFileHandle h,IntPtr e,IntPtr a,IntPtr c,out IOSB io,IntPtr b,uint n,int cls,[MarshalAs(UnmanagedType.U1)]bool single,IntPtr name,[MarshalAs(UnmanagedType.U1)]bool restart);
    [DllImport("ntdll.dll")] static extern uint RtlNtStatusToDosError(int s);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out INFO i);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int c,out BASIC b,uint n);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle h,int c,ref BASIC b,uint n);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteFile(SafeFileHandle h,byte[] b,uint n,out uint w,IntPtr ov);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadFile(SafeFileHandle h,byte[] b,uint n,out uint r,IntPtr ov);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFilePointerEx(SafeFileHandle h,long o,out long p,uint m);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool FlushFileBuffers(SafeFileHandle h);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileTime(SafeFileHandle h,IntPtr creation,ref long access,ref long write);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetKernelObjectSecurity(SafeFileHandle h,uint info,byte[] sd,uint n,out uint needed);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetSecurityDescriptorControl(IntPtr sd,out ushort control,out uint revision);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetSecurityDescriptorDacl(IntPtr sd,out bool present,out IntPtr dacl,out bool defaulted);
    [DllImport("advapi32.dll",SetLastError=true)] static extern uint SetSecurityInfo(IntPtr handle,int objectType,uint securityInfo,IntPtr owner,IntPtr group,IntPtr dacl,IntPtr sacl);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeInformationByHandleW(SafeFileHandle h,StringBuilder name,uint n,out uint serial,out uint max,out uint flags,StringBuilder fs,uint count);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetDriveTypeW(string root);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder path,uint size,uint flags);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string s,uint revision,out IntPtr sd,out uint size);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);

    sealed class NativeFailure : Exception { public string Code; public NativeFailure(string code) { Code=code; } }
    static void Need(bool pass,string code) { if(!pass) throw new NativeFailure(code); }
    static string Hash(byte[] b) { return Convert.ToHexString(SHA256.HashData(b)).ToLowerInvariant(); }
    static INFO Info(SafeFileHandle h) { INFO i; Need(GetFileInformationByHandle(h,out i),"IDENTITY_UNAVAILABLE"); return i; }
    static string Identity(SafeFileHandle h) { var i=Info(h); return i.Volume+":"+i.IndexHi+":"+i.IndexLo; }
    static void CanonicalPath(SafeFileHandle h,string expected) {
        var path=new StringBuilder(32768); uint count=GetFinalPathNameByHandleW(h,path,32768,0);
        Need(count>0&&count<32768&&path.ToString().Equals("\\\\?\\"+expected,StringComparison.OrdinalIgnoreCase),"NATIVE_PATH_ALIAS");
    }
    static byte[] Security(SafeFileHandle h) {
        uint needed; GetKernelObjectSecurity(h,7,null,0,out needed);
        Need(needed>0&&needed<=MaxRecord,"SECURITY_UNAVAILABLE"); byte[] bytes=new byte[needed];
        Need(GetKernelObjectSecurity(h,7,bytes,needed,out needed),"SECURITY_UNAVAILABLE"); return bytes;
    }
    static byte[] CompleteSecurity(SafeFileHandle h) {
        // BACKUP_SECURITY_INFORMATION includes SACL/audit, labels, resource attributes and CAP.
        // Do not infer absence from a READ_CONTROL-only descriptor or enable privileges.
        uint needed; GetKernelObjectSecurity(h,0x00010000,null,0,out needed);
        int error=Marshal.GetLastWin32Error();
        Need(needed>0&&needed<=MaxRecord,"FULL_SECURITY_UNAVAILABLE_"+error);
        byte[] bytes=new byte[needed];
        Need(GetKernelObjectSecurity(h,0x00010000,bytes,needed,out needed),"FULL_SECURITY_UNAVAILABLE_"+Marshal.GetLastWin32Error());
        var descriptor=new System.Security.AccessControl.RawSecurityDescriptor(bytes,0);
        // Nonempty SACL semantics are not yet qualified for exact native recreation.
        Need(descriptor.SystemAcl==null||descriptor.SystemAcl.Count==0,"UNSUPPORTED_SYSTEM_SECURITY");
        return bytes;
    }
    static SafeFileHandle FullSecurityFile(SafeFileHandle parent,string name,uint access) {
        try { return Relative(parent,name,false,1,access|0x01000000,0); }
        catch(NativeFailure error) { throw new NativeFailure("FULL_SECURITY_OPEN_"+error.Code); }
    }
    static byte[] PrivateSecurity() {
        string sid=System.Security.Principal.WindowsIdentity.GetCurrent().User.Value;
        IntPtr sd; uint size; Need(ConvertStringSecurityDescriptorToSecurityDescriptorW("O:"+sid+"G:"+sid+"D:P(A;;FA;;;"+sid+")",1,out sd,out size),"PRIVATE_SECURITY_UNAVAILABLE");
        try { byte[] bytes=new byte[size]; Marshal.Copy(sd,bytes,0,(int)size); return bytes; }
        finally { LocalFree(sd); }
    }
    static void SecurityEligible(byte[] security) {
        var descriptor=new System.Security.AccessControl.RawSecurityDescriptor(security,0);
        string caller=System.Security.Principal.WindowsIdentity.GetCurrent().User.Value;
        Need(descriptor.Owner!=null&&descriptor.Group!=null&&descriptor.Owner.Value==caller&&descriptor.Group.Value==caller,"UNSUPPORTED_SECURITY_OWNER_GROUP");
        IntPtr sd=Marshal.AllocHGlobal(security.Length);
        try {
            Marshal.Copy(security,0,sd,security.Length); ushort control; uint revision;
            Need(GetSecurityDescriptorControl(sd,out control,out revision),"SECURITY_UNAVAILABLE");
            // Inheritance prediction is not implemented: unknown fidelity is denied before transaction mutation.
            Need((control&0x1000)!=0,"UNSUPPORTED_INHERITED_SECURITY");
        } finally { Marshal.FreeHGlobal(sd); }
    }
    static void PrivateDirectoryEligible(SafeFileHandle directory) {
        byte[] security=Security(directory); SecurityEligible(security);
        var descriptor=new System.Security.AccessControl.RawSecurityDescriptor(security,0);
        Need(descriptor.DiscretionaryAcl!=null&&descriptor.DiscretionaryAcl.Count==1,"TRANSACTION_SECURITY_MISMATCH");
        var ace=descriptor.DiscretionaryAcl[0] as System.Security.AccessControl.CommonAce;
        Need(ace!=null&&ace.AceQualifier==System.Security.AccessControl.AceQualifier.AccessAllowed
            &&ace.SecurityIdentifier.Value==System.Security.Principal.WindowsIdentity.GetCurrent().User.Value
            &&ace.AccessMask==0x1F01FF&&ace.AceFlags==System.Security.AccessControl.AceFlags.None,"TRANSACTION_SECURITY_MISMATCH");
    }
    static List<string> Names(SafeFileHandle directory) {
        var names=new List<string>(); IntPtr buffer=Marshal.AllocHGlobal(MaxRecord); bool restart=true;
        try {
            while(true) {
                IOSB io; int status=NtQueryDirectoryFile(directory,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,out io,buffer,MaxRecord,12,false,IntPtr.Zero,restart); restart=false;
                if(unchecked((uint)status)==0x80000006) break;
                Need(status>=0,"DIRECTORY_ENUMERATION_FAILED"); int offset=0;
                while(true) {
                    Need(offset+12<=(long)io.Information.ToUInt64(),"DIRECTORY_RESPONSE_INVALID");
                    int next=Marshal.ReadInt32(buffer,offset), length=Marshal.ReadInt32(buffer,offset+8);
                    Need(length>=0&&length<=510&&offset+12+length<=(long)io.Information.ToUInt64(),"DIRECTORY_RESPONSE_INVALID");
                    string name=Marshal.PtrToStringUni(IntPtr.Add(buffer,offset+12),length/2);
                    if(name!="."&&name!="..") names.Add(name);
                    Need(names.Count<=1024,"TRANSACTION_COUNT_LIMIT");
                    if(next==0) break; Need(next>=12,"DIRECTORY_RESPONSE_INVALID"); offset+=next;
                }
            }
            return names;
        } finally { Marshal.FreeHGlobal(buffer); }
    }
    static string ReadLineBounded(int limit) {
        var text=new StringBuilder(); int value;
        while((value=Console.In.Read())!=-1&&value!='\n') { Need(text.Length<limit,"PROTOCOL_FRAME_LIMIT"); text.Append((char)value); }
        Need(value!=-1,"ACKNOWLEDGEMENT_REQUIRED"); return text.ToString();
    }
    static void Event(string kind,object value) {
        Console.Out.WriteLine(JsonSerializer.Serialize(new {type=kind,value})); Console.Out.Flush();
        if(kind!="prepared") {
            using var ack=JsonDocument.Parse(ReadLineBounded(1024));
            Need(ack.RootElement.GetProperty("type").GetString()=="continue","BARRIER_NOT_ACKNOWLEDGED");
        }
    }
    sealed class Transaction {
        public string Id=Guid.NewGuid().ToString("N"), Phase="REJECTED_BEFORE_MUTATION", PreviousHash;
        public bool Directory, Staging, Backup, Journal, Parked, Published, Recovery;
        public int Sequence;
        public object Receipt;
        public object Effects() { return new { transactionDirectory=Directory,staging=Staging,backup=Backup,journal=Journal,parked=Parked,destination=Published,retainedArtifactsMayExist=Directory||Staging||Backup||Journal||Parked||Recovery,originalNameMayBeAbsent=(Parked||Recovery)&&!Published }; }
        public object Result(bool success,string code) { return new {success,code,phase=Phase,lastReconstructablePhase=Phase,transactionId=Id,receipt=Receipt,effects=Effects(),productionEnabled=false}; }
    }
    static void ClassifyFreshOriginalAcquisitionFailure(Transaction tx,NativeFailure error) {
        bool pristine=tx.Phase=="REJECTED_BEFORE_MUTATION"&&tx.PreviousHash==null&&tx.Sequence==0&&tx.Receipt==null
            &&!tx.Directory&&!tx.Staging&&!tx.Backup&&!tx.Journal&&!tx.Parked&&!tx.Published&&!tx.Recovery;
        if(pristine&&error.Code=="FULL_SECURITY_OPEN_NATIVE_1314") tx.Phase="UNSUPPORTED_BEFORE_MUTATION";
    }
    static SafeFileHandle AcquireOriginalForReplacement(SafeFileHandle parent,string leaf,Transaction tx) {
        try { return FullSecurityFile(parent,leaf,0x80130180); }
        catch(NativeFailure error) { ClassifyFreshOriginalAcquisitionFailure(tx,error); throw; }
    }
    static SafeFileHandle PublishRecord(SafeFileHandle directory,string name,byte[] bytes,byte[] security,List<SafeFileHandle> handles) {
        Need(bytes.Length<=MaxRecord,"RECORD_LIMIT");
        var file=Relative(directory,name,false,2,FileAccessMask,0,security); handles.Add(file); Write(file,bytes); return file;
    }
    static void Phase(Transaction tx,SafeFileHandle directory,string phase,byte[] security,List<SafeFileHandle> handles) {
        byte[] bytes=JsonSerializer.SerializeToUtf8Bytes(new {version=1,transactionId=tx.Id,phase,previous=tx.PreviousHash});
        PublishRecord(directory,(++tx.Sequence).ToString("D3")+"-"+phase+".json",bytes,security,handles);
        tx.PreviousHash=Hash(bytes); tx.Phase=phase; Event("phase",tx.Result(false,"IN_PROGRESS"));
    }
    static SafeFileHandle Relative(SafeFileHandle parent,string name,bool directory,uint disposition,uint access,uint share,byte[] security=null) {
        Need(name.Length>0&&name.Length<=255&&name.IndexOfAny(new[]{'\\','/',':','\0'})<0&&name!="."&&name!="..","INVALID_COMPONENT");
        IntPtr text=Marshal.StringToHGlobalUni(name), u=IntPtr.Zero, sd=IntPtr.Zero;
        try {
            US us=new US{Length=checked((ushort)(name.Length*2)),MaximumLength=checked((ushort)(name.Length*2+2)),Buffer=text};
            u=Marshal.AllocHGlobal(Marshal.SizeOf<US>()); Marshal.StructureToPtr(us,u,false);
            if(security!=null) { sd=Marshal.AllocHGlobal(security.Length); Marshal.Copy(security,0,sd,security.Length); }
            OA oa=new OA{Length=(uint)Marshal.SizeOf<OA>(),Root=parent.DangerousGetHandle(),Name=u,Attributes=0x40,Security=sd};
            SafeFileHandle h; IOSB io;
            int status=NtCreateFile(out h,access,ref oa,out io,IntPtr.Zero,directory?0x10u:0x80u,share,disposition,0x200020u|(directory?1u:0x40u),IntPtr.Zero,0);
            if(status<0) { h?.Dispose(); throw new NativeFailure("NATIVE_"+RtlNtStatusToDosError(status)); }
            try { var info=Info(h); Need((info.Attr&0x400)==0,"REPARSE_DENIED");
                Need(directory?(info.Attr&0x10)!=0:((info.Attr&0x10)==0&&info.Links==1),"KIND_DENIED");
                if(!directory&&(access&0x100)!=0) {
                    long unchanged=-1; Need(SetFileTime(h,IntPtr.Zero,ref unchanged,ref unchanged),"TIMESTAMP_PRESERVATION_UNAVAILABLE");
                }
                return h;
            } catch { h.Dispose(); throw; }
        } finally { if(u!=IntPtr.Zero) Marshal.FreeHGlobal(u); if(sd!=IntPtr.Zero) Marshal.FreeHGlobal(sd); Marshal.FreeHGlobal(text); }
    }
    static byte[] Read(SafeFileHandle h,int limit=MaxContent) {
        var i=Info(h); Need(i.SizeHi==0&&i.SizeLo<=limit,"CONTENT_LIMIT");
        long position; Need(SetFilePointerEx(h,0,out position,0),"SEEK_FAILED"); byte[] bytes=new byte[i.SizeLo]; uint read;
        Need(ReadFile(h,bytes,(uint)bytes.Length,out read,IntPtr.Zero)&&read==bytes.Length,"READ_FAILED"); return bytes;
    }
    static void Write(SafeFileHandle h,byte[] bytes) {
        uint written; Need(WriteFile(h,bytes,(uint)bytes.Length,out written,IntPtr.Zero)&&written==bytes.Length,"WRITE_FAILED");
        Need(FlushFileBuffers(h),"FLUSH_FAILED"); Need(Hash(Read(h,Math.Max(MaxContent,bytes.Length)))==Hash(bytes),"STAGING_HASH_MISMATCH");
    }
    static void Rename(SafeFileHandle source,SafeFileHandle parent,string name) {
        byte[] bytes=Encoding.Unicode.GetBytes(name); int length=checked(Marshal.SizeOf<RENAME>()+bytes.Length);
        IntPtr p=Marshal.AllocHGlobal(length);
        try {
            Marshal.Copy(new byte[length],0,p,length); // ReplaceIfExists is always false.
            Marshal.WriteIntPtr(p,(int)Marshal.OffsetOf<RENAME>("RootDirectory"),parent.DangerousGetHandle());
            Marshal.WriteInt32(p,(int)Marshal.OffsetOf<RENAME>("FileNameLength"),bytes.Length);
            Marshal.Copy(bytes,0,IntPtr.Add(p,(int)Marshal.OffsetOf<RENAME>("FirstChar")),bytes.Length);
            IOSB io; int status=NtSetInformationFile(source,out io,p,(uint)length,10);
            Need(status>=0,"RENAME_"+RtlNtStatusToDosError(status));
        } finally { Marshal.FreeHGlobal(p); }
    }
    static BASIC Eligible(SafeFileHandle h) {
        var i=Info(h); Need(i.Links==1&&(i.Attr&~0xA0u)==0,"UNSUPPORTED_ATTRIBUTES");
        BASIC b; Need(GetFileInformationByHandleEx(h,0,out b,(uint)Marshal.SizeOf<BASIC>()),"METADATA_UNAVAILABLE");
        IntPtr buffer=Marshal.AllocHGlobal(MaxRecord);
        try {
            IOSB io; int status=NtQueryInformationFile(h,out io,buffer,MaxRecord,22);
            Need(status>=0,"STREAMS_UNAVAILABLE");
            Need(Marshal.ReadInt32(buffer)==0,"ADS_DENIED");
            int nameLength=Marshal.ReadInt32(buffer,4);
            Need(nameLength==14&&Marshal.PtrToStringUni(IntPtr.Add(buffer,24),7)=="::$DATA","ADS_DENIED");
            status=NtQueryInformationFile(h,out io,buffer,4,7);
            Need(status>=0&&Marshal.ReadInt32(buffer)==0,"EXTENDED_ATTRIBUTES_DENIED");
        } finally { Marshal.FreeHGlobal(buffer); }
        return b;
    }
    static void ApplyMetadata(SafeFileHandle h,byte[] security,BASIC metadata) {
        // The exact descriptor is supplied at exclusive creation. Reapplying it with
        // SetSecurityInfo changes inheritance control bits even on a protected DACL.
        Need(Hash(CompleteSecurity(h))==Hash(security),"SECURITY_FIDELITY_MISMATCH");
        metadata.Change=0;
        Need(SetFileInformationByHandle(h,0,ref metadata,(uint)Marshal.SizeOf<BASIC>()),"METADATA_PRESERVATION_FAILED");
        BASIC after; Need(GetFileInformationByHandleEx(h,0,out after,(uint)Marshal.SizeOf<BASIC>()),"METADATA_UNAVAILABLE");
        Need(after.Creation==metadata.Creation&&after.Access==metadata.Access&&after.Write==metadata.Write&&after.Attributes==metadata.Attributes,"METADATA_FIDELITY_MISMATCH");
    }
    static bool KnownProtectedDaclCreationLoss(byte[] expected,byte[] created) {
        if(expected==null||created==null||expected.Length!=created.Length||expected.Length<28) return false;
        if(BitConverter.ToUInt16(expected,2)!=0x9404||BitConverter.ToUInt16(created,2)!=0x9004) return false;
        uint dacl=BitConverter.ToUInt32(expected,16);
        if(dacl<20||dacl>(uint)(expected.Length-8)) return false;
        for(int index=0;index<expected.Length;index++) if(index!=3&&expected[index]!=created[index]) return false;
        return true;
    }
    static void RestoreCreatedSecurityFidelity(SafeFileHandle h,byte[] expected) {
        byte[] created=CompleteSecurity(h);
        if(Hash(created)==Hash(expected)||!KnownProtectedDaclCreationLoss(expected,created)) return;
        var before=Info(h); string identity=Identity(h);
        Need(before.SizeHi==0&&before.SizeLo==0&&before.Links==1&&(before.Attr&0x410)==0,"SECURITY_FIDELITY_FILE_CHANGED");
        var pin=GCHandle.Alloc(expected,GCHandleType.Pinned);
        try {
            IntPtr descriptor=pin.AddrOfPinnedObject(), dacl; bool present, defaulted;
            Need(GetSecurityDescriptorDacl(descriptor,out present,out dacl,out defaulted)&&present&&dacl!=IntPtr.Zero,"SECURITY_FIDELITY_DACL_UNAVAILABLE");
            uint status=SetSecurityInfo(h.DangerousGetHandle(),1,0x80000004u,IntPtr.Zero,IntPtr.Zero,dacl,IntPtr.Zero);
            Need(status==0,"SECURITY_FIDELITY_RESTORE_"+status);
        } finally { pin.Free(); }
        var after=Info(h);
        Need(Identity(h)==identity&&after.SizeHi==0&&after.SizeLo==0&&after.Links==1&&(after.Attr&0x410)==0,"SECURITY_FIDELITY_FILE_CHANGED");
    }
    static bool Absent(SafeFileHandle parent,string leaf) {
        try { using var existing=Relative(parent,leaf,false,1,0x80120080,0); return false; }
        catch(NativeFailure error) { if(error.Code=="NATIVE_2") return true; throw; }
    }
    static object ExecuteTransaction(JsonElement req,SafeFileHandle root,SafeFileHandle parent,string leaf,string rootIdentity,string parentIdentity,uint volume,List<SafeFileHandle> handles,Transaction tx) {
        var ancestry=new List<string>(); foreach(var handle in handles) ancestry.Add(Identity(handle));
        string operation=req.GetProperty("operation").GetString();
        if(operation=="guarded-recover") return Recover(req,root,parent,leaf,rootIdentity,parentIdentity,ancestry,handles,tx);
        byte[] after=Convert.FromBase64String(req.GetProperty("contentBase64").GetString()); Need(after.Length<=MaxContent,"CONTENT_LIMIT");
        byte[] privateSecurity=PrivateSecurity(), sourceSecurity=privateSecurity, before=null;
        SafeFileHandle original=null; BASIC metadata=new BASIC(); string originalIdentity=null;
        if(operation=="guarded-recoverable-replace") {
            Need(req.GetProperty("isolatedWorkspace").GetBoolean()&&req.GetProperty("allowAbsentName").GetBoolean(),"ABSENT_NAME_OPT_IN_REQUIRED");
            original=AcquireOriginalForReplacement(parent,leaf,tx); handles.Add(original);
            var expected=req.GetProperty("expectedBefore"); originalIdentity=Identity(original);
            Need(originalIdentity==expected.GetProperty("identity").GetString(),"EXPECTED_IDENTITY_MISMATCH");
            metadata=Eligible(original); sourceSecurity=CompleteSecurity(original); SecurityEligible(sourceSecurity);
            before=Read(original); Need(Hash(before)==expected.GetProperty("sha256").GetString(),"EXPECTED_HASH_MISMATCH");
        } else Need(Absent(parent,leaf),"DESTINATION_EXISTS");
        Event("barrier",new {phase="BEFORE_RESERVATION",transactionId=tx.Id});
        SafeFileHandle transactions=null;
        bool createdLedger=false;
        try { transactions=Relative(root,".aexos-transactions",true,1,DirectoryAccess,0); }
        catch(NativeFailure error) {
            if(error.Code!="NATIVE_2") throw;
        }
        if(transactions!=null) handles.Add(transactions);
        var observed=transactions==null?new List<string>():Names(transactions); observed.Sort(StringComparer.Ordinal);
        long reservationSize=checked(after.LongLength+2L*(before==null?0:before.LongLength)+1024L*1024);
        Need(reservationSize<=16L*1024*1024,"RESERVATION_LIMIT");
        Event("quota",new {action="reserve",rootIdentity,ledgerIdentity=transactions==null?null:Identity(transactions),
            transactionId=tx.Id,observedTransactionIds=observed,reservedBytes=reservationSize,ceilingBytes=128L*1024*1024});
        if(transactions==null) {
            transactions=Relative(root,".aexos-transactions",true,2,DirectoryAccess,0,privateSecurity);
            handles.Add(transactions);
            tx.Directory=true; tx.Phase="RESERVED";
            createdLedger=true;
        }
        PrivateDirectoryEligible(transactions);
        Event("quota",new {action="anchor",rootIdentity,ledgerIdentity=Identity(transactions),transactionId=tx.Id,observedTransactionIds=observed});
        // An exclusive directory handle is the cross-process accounting lock; no child
        // transaction is created until all retained reservations are accounted for.
        var accounting=transactions;
        long reserved=0; var names=Names(accounting);
        Need(createdLedger||names.Count>0,"UNKNOWN_ACCOUNTING_ENTRY");
        foreach(string name in names) {
            Need(System.Text.RegularExpressions.Regex.IsMatch(name,"^[a-f0-9]{32}$"),"UNKNOWN_ACCOUNTING_ENTRY");
            using var directory=Relative(accounting,name,true,1,DirectoryAccess,3);
            using var reservation=Relative(directory,"reservation.json",false,1,0x80120180,1);
            using var record=JsonDocument.Parse(Read(reservation,MaxRecord));
            Need(record.RootElement.GetProperty("rootIdentity").GetString()==rootIdentity,"ACCOUNTING_ROOT_MISMATCH");
            long amount=record.RootElement.GetProperty("reservedBytes").GetInt64();
            Need(amount>0&&amount<=16*1024*1024,"INVALID_RESERVATION"); reserved=checked(reserved+amount);
            using var preparedRecord=Relative(directory,"prepared.json",false,1,0x80120180,1);
            byte[] bytes=Read(preparedRecord,MaxRecord);
            using var preparedDocument=JsonDocument.Parse(bytes);
            Need(Identity(reservation)==preparedDocument.RootElement.GetProperty("reservationIdentity").GetString()
                &&Hash(Read(reservation,MaxRecord))==preparedDocument.RootElement.GetProperty("reservationSha256").GetString(),"RESERVATION_MISMATCH");
            Event("accounting",new {transactionId=name,preparedSha256=Hash(bytes),preparedIdentity=Identity(preparedRecord),transactionIdentity=Identity(directory),rootIdentity,reservedBytes=amount});
        }
        // Independently retained worst-case charge includes stage, both before-images and bounded record overhead.
        Need(reserved+reservationSize<=128L*1024*1024,"RETENTION_QUOTA_EXHAUSTED");
        var transaction=Relative(accounting,tx.Id,true,2,DirectoryAccess,3,privateSecurity); handles.Add(transaction); tx.Directory=true; tx.Phase="RESERVED";
        byte[] reservationBytes=JsonSerializer.SerializeToUtf8Bytes(new {version=1,transactionId=tx.Id,rootIdentity,reservedBytes=reservationSize});
        var reservationRecord=PublishRecord(transaction,"reservation.json",reservationBytes,privateSecurity,handles);
        // Keep the exclusive accounting lock until every file operation completes. This
        // intentionally chooses immediate contention denial over a retry or lock queue.
        SafeFileHandle backup=null;
        if(before!=null) {
            backup=Relative(transaction,"backup.bin",false,2,FileAccessMask|0x01000000,0,sourceSecurity); handles.Add(backup); tx.Backup=true;
            RestoreCreatedSecurityFidelity(backup,sourceSecurity);
            Need(Hash(CompleteSecurity(backup))==Hash(sourceSecurity),"BACKUP_SECURITY_MISMATCH");
            Write(backup,before); ApplyMetadata(backup,sourceSecurity,metadata);
            Event("barrier",new {phase="BACKUP_PUBLISHED",transactionId=tx.Id});
        }
        string stageName=".aexos-"+tx.Id+".stage";
        var staged=Relative(parent,stageName,false,2,FileAccessMask|(before!=null?0x01000000u:0u),0,sourceSecurity); handles.Add(staged); tx.Staging=true;
        if(before!=null) { RestoreCreatedSecurityFidelity(staged,sourceSecurity); Need(Hash(CompleteSecurity(staged))==Hash(sourceSecurity),"STAGING_SECURITY_MISMATCH"); }
        Write(staged,after); if(before!=null) ApplyMetadata(staged,sourceSecurity,metadata);
        Event("barrier",new {phase="STAGED",transactionId=tx.Id});
        var prepared=new { version=1, protocol="aexos-guarded-publication-v1",transactionId=tx.Id,
            rootIdentity,parentIdentity,ancestry,target=req.GetProperty("target").GetString(),volume,ledgerIdentity=Identity(transactions),
            transactionIdentity=Identity(transaction),stageIdentity=Identity(staged),stageName,
            reservationIdentity=Identity(reservationRecord),reservationSha256=Hash(reservationBytes),
            beforeIdentity=originalIdentity,beforeSha256=before==null?null:Hash(before),afterSha256=Hash(after),
            backupIdentity=backup==null?null:Identity(backup),securitySha256=Hash(sourceSecurity),
            authority=req.GetProperty("authority").Clone(),helperSha256=req.GetProperty("helperSha256").GetString(),
            runtimeIdentity=req.GetProperty("runtimeIdentity").Clone(),
            launcherSha256=req.GetProperty("launcherSha256").GetString(),reservedBytes=reservationSize,
            metadata=new { creation=metadata.Creation.ToString(),access=metadata.Access.ToString(),write=metadata.Write.ToString(),attributes=metadata.Attributes },
            retention="indefinite-no-cleanup", absentNameInterval=before!=null };
        byte[] preparedBytes=JsonSerializer.SerializeToUtf8Bytes(prepared);
        var journal=PublishRecord(transaction,"prepared.json",preparedBytes,privateSecurity,handles); tx.Journal=true;
        tx.PreviousHash=Hash(preparedBytes); tx.Phase="PREPARED";
        tx.Receipt=new { protocol="aexos-guarded-publication-v1",transactionId=tx.Id,preparedSha256=Hash(preparedBytes),
            preparedIdentity=Identity(journal),prepared,productionEnabled=false };
        Event("prepared",tx.Receipt);
        using(var acknowledgement=JsonDocument.Parse(ReadLineBounded(MaxRecord))) {
            var ack=acknowledgement.RootElement;
            Need(ack.GetProperty("type").GetString()=="retained"&&ack.GetProperty("transactionId").GetString()==tx.Id
                &&ack.GetProperty("preparedSha256").GetString()==tx.PreviousHash,"TRUSTED_RECEIPT_NOT_ACKNOWLEDGED");
        }
        Event("barrier",new {phase="RECEIPT_ACKNOWLEDGED",transactionId=tx.Id});
        if(original!=null) {
            Rename(original,transaction,"parked.bin"); tx.Parked=true;
            Phase(tx,transaction,"ORIGINAL_PARKED",privateSecurity,handles);
        }
        Rename(staged,parent,leaf); tx.Published=true;
        Phase(tx,transaction,"PUBLISHED",privateSecurity,handles);
        Need(Hash(Read(staged))==Hash(after),"PUBLISHED_HASH_MISMATCH");
        if(before!=null) { Need(Hash(CompleteSecurity(staged))==Hash(sourceSecurity),"PUBLISHED_SECURITY_MISMATCH"); ApplyMetadata(staged,sourceSecurity,metadata); }
        Phase(tx,transaction,"VERIFIED",privateSecurity,handles);
        return tx.Result(true,"OK");
    }
    static object Recover(JsonElement req,SafeFileHandle root,SafeFileHandle parent,string leaf,string rootIdentity,string parentIdentity,List<string> ancestry,List<SafeFileHandle> handles,Transaction tx) {
        tx.Recovery=true;
        var anchor=req.GetProperty("trustedReceipt"); var prepared=anchor.GetProperty("prepared");
        var authority=req.GetProperty("authority"); var priorAuthority=prepared.GetProperty("authority");
        Need(authority.GetProperty("agentId").GetString()==priorAuthority.GetProperty("agentId").GetString()
            &&authority.GetProperty("task").GetString()==priorAuthority.GetProperty("task").GetString()
            &&authority.GetProperty("story").GetRawText()==priorAuthority.GetProperty("story").GetRawText(),"RECOVERY_AUTHORITY_MISMATCH");
        tx.Id=anchor.GetProperty("transactionId").GetString();
        Need(System.Text.RegularExpressions.Regex.IsMatch(tx.Id,"^[a-f0-9]{32}$"),"INVALID_TRANSACTION");
        Need(prepared.GetProperty("rootIdentity").GetString()==rootIdentity&&prepared.GetProperty("parentIdentity").GetString()==parentIdentity
            &&prepared.GetProperty("target").GetString()==req.GetProperty("target").GetString(),"RECOVERY_IDENTITY_MISMATCH");
        Need(prepared.GetProperty("ancestry").GetRawText()==JsonSerializer.Serialize(ancestry),"RECOVERY_ANCESTRY_MISMATCH");
        Need(prepared.GetProperty("helperSha256").GetString()==req.GetProperty("helperSha256").GetString()
            &&prepared.GetProperty("launcherSha256").GetString()==req.GetProperty("launcherSha256").GetString(),"RECOVERY_HELPER_IDENTITY_MISMATCH");
        Need(prepared.GetProperty("runtimeIdentity").GetRawText()==req.GetProperty("runtimeIdentity").GetRawText(),"RECOVERY_RUNTIME_IDENTITY_MISMATCH");
        var transactions=Relative(root,".aexos-transactions",true,1,DirectoryAccess,0); handles.Add(transactions);
        PrivateDirectoryEligible(transactions);
        Need(Identity(transactions)==prepared.GetProperty("ledgerIdentity").GetString(),"LEDGER_IDENTITY_MISMATCH");
        var observed=Names(transactions); observed.Sort(StringComparer.Ordinal);
        Event("quota",new {action="reconcile",rootIdentity,ledgerIdentity=Identity(transactions),transactionId=tx.Id,observedTransactionIds=observed});
        var directory=Relative(transactions,tx.Id,true,1,DirectoryAccess,3); handles.Add(directory);
        Need(Identity(directory)==prepared.GetProperty("transactionIdentity").GetString(),"TRANSACTION_IDENTITY_MISMATCH");
        var journal=Relative(directory,"prepared.json",false,1,0x80120180,0); handles.Add(journal);
        Eligible(journal);
        byte[] journalBytes=Read(journal,MaxRecord);
        Need(Identity(journal)==anchor.GetProperty("preparedIdentity").GetString()&&Hash(journalBytes)==anchor.GetProperty("preparedSha256").GetString(),"JOURNAL_ANCHOR_MISMATCH");
        using var parsed=JsonDocument.Parse(journalBytes);
        Need(parsed.RootElement.GetRawText()==JsonSerializer.Serialize(prepared),"JOURNAL_CONTENT_MISMATCH");
        tx.Directory=true; tx.Journal=true; tx.Receipt=anchor.Clone(); tx.PreviousHash=Hash(journalBytes);
        var reservation=Relative(directory,"reservation.json",false,1,0x80120180,0); handles.Add(reservation);
        Eligible(reservation);
        Need(Identity(reservation)==prepared.GetProperty("reservationIdentity").GetString()
            &&Hash(Read(reservation,MaxRecord))==prepared.GetProperty("reservationSha256").GetString(),"RESERVATION_MISMATCH");
        var names=Names(directory); names.Sort(StringComparer.Ordinal);
        string priorPhase="PREPARED";
        foreach(string name in names) {
            if(name=="prepared.json"||name=="reservation.json"||name=="backup.bin"||name=="parked.bin") continue;
            Need(System.Text.RegularExpressions.Regex.IsMatch(name,"^[0-9]{3}-(ORIGINAL_PARKED|PUBLISHED|VERIFIED|RECOVERED)\\.json$"),"UNKNOWN_RECOVERY_ARTIFACT");
            using var phase=Relative(directory,name,false,1,0x80120180,0);
            Eligible(phase);
            byte[] bytes=Read(phase,MaxRecord); using var record=JsonDocument.Parse(bytes);
            var fields=new HashSet<string>(); foreach(var field in record.RootElement.EnumerateObject()) Need(fields.Add(field.Name),"PHASE_SCHEMA_MISMATCH");
            Need(fields.SetEquals(new[]{"version","transactionId","phase","previous"})&&record.RootElement.GetProperty("version").GetInt32()==1,"PHASE_SCHEMA_MISMATCH");
            string recordedPhase=record.RootElement.GetProperty("phase").GetString();
            Need(name==(tx.Sequence+1).ToString("D3")+"-"+recordedPhase+".json","PHASE_SEQUENCE_MISMATCH");
            Need((priorPhase=="PREPARED"&&(recordedPhase=="ORIGINAL_PARKED"||recordedPhase=="PUBLISHED"))
                ||(priorPhase=="ORIGINAL_PARKED"&&(recordedPhase=="PUBLISHED"||recordedPhase=="RECOVERED"))
                ||(priorPhase=="PUBLISHED"&&recordedPhase=="VERIFIED"),"PHASE_ORDER_MISMATCH");
            Need(record.RootElement.GetProperty("previous").GetString()==tx.PreviousHash&&record.RootElement.GetProperty("transactionId").GetString()==tx.Id,"PHASE_CHAIN_MISMATCH");
            priorPhase=recordedPhase;
            tx.PreviousHash=Hash(bytes); tx.Sequence++;
        }
        string stageName=prepared.GetProperty("stageName").GetString();
        Need(stageName==".aexos-"+tx.Id+".stage","STAGE_NAME_MISMATCH");
        // Validate retained staging before any recovery mutation, even when full-security access is unavailable.
        var staged=Relative(parent,stageName,false,1,0x80120180,0); handles.Add(staged); tx.Staging=true;
        BASIC stageMetadata=Eligible(staged);
        Need(Identity(staged)==prepared.GetProperty("stageIdentity").GetString()
            &&Hash(Read(staged))==prepared.GetProperty("afterSha256").GetString(),"STAGE_MISMATCH");
        staged.Dispose();
        staged=FullSecurityFile(parent,stageName,0x80120180); handles.Add(staged);
        stageMetadata=Eligible(staged);
        Need(Identity(staged)==prepared.GetProperty("stageIdentity").GetString()
            &&Hash(Read(staged))==prepared.GetProperty("afterSha256").GetString()
            &&Hash(CompleteSecurity(staged))==prepared.GetProperty("securitySha256").GetString(),"STAGE_MISMATCH");
        var backup=FullSecurityFile(directory,"backup.bin",0x80120180); handles.Add(backup); tx.Backup=true;
        Need(Identity(backup)==prepared.GetProperty("backupIdentity").GetString()&&Hash(Read(backup))==prepared.GetProperty("beforeSha256").GetString(),"BACKUP_MISMATCH");
        BASIC backupMetadata=Eligible(backup);
        Need(Hash(CompleteSecurity(backup))==prepared.GetProperty("securitySha256").GetString(),"BACKUP_SECURITY_MISMATCH");
        var parked=FullSecurityFile(directory,"parked.bin",0x80130180); handles.Add(parked); tx.Parked=true;
        BASIC parkedMetadata=Eligible(parked);
        Need(Identity(parked)==prepared.GetProperty("beforeIdentity").GetString()&&Hash(Read(parked))==prepared.GetProperty("beforeSha256").GetString()
            &&Hash(CompleteSecurity(parked))==prepared.GetProperty("securitySha256").GetString(),"PARKED_MISMATCH");
        var expectedMetadata=prepared.GetProperty("metadata");
        foreach(BASIC actual in new[]{stageMetadata,backupMetadata,parkedMetadata}) {
            Need(actual.Creation.ToString()==expectedMetadata.GetProperty("creation").GetString()
                &&actual.Access.ToString()==expectedMetadata.GetProperty("access").GetString()
                &&actual.Write.ToString()==expectedMetadata.GetProperty("write").GetString()
                &&actual.Attributes==expectedMetadata.GetProperty("attributes").GetUInt32(),"RECOVERY_METADATA_MISMATCH");
        }
        Need(Absent(parent,leaf),"RECOVERY_NAME_OCCUPIED");
        Event("barrier",new {phase="BEFORE_RECOVERY",transactionId=tx.Id});
        Rename(parked,parent,leaf); tx.Parked=false; tx.Published=true;
        Phase(tx,directory,"RECOVERED",PrivateSecurity(),handles);
        return tx.Result(true,"OK");
    }
    public static string Run(string input) {
        var handles=new List<SafeFileHandle>();
        var tx=new Transaction();
        try {
            Need(Encoding.UTF8.GetByteCount(input)<=6291456,"REQUEST_LIMIT");
            using var doc=JsonDocument.Parse(input); var req=doc.RootElement;
            Need(req.ValueKind==JsonValueKind.Object,"INVALID_PROTOCOL");
            var allowed=new HashSet<string>{"protocol","root","operation","target","contentBase64","expectedBefore","trustedReceipt","authority","helperSha256","launcherSha256","isolatedWorkspace","allowAbsentName","runtimeIdentity"};
            var seen=new HashSet<string>(); foreach(var field in req.EnumerateObject()) Need(allowed.Contains(field.Name)&&seen.Add(field.Name),"INVALID_PROTOCOL");
            Need(req.GetProperty("protocol").GetString()=="aexos-guarded-publication-v1","INVALID_PROTOCOL");
            string root=req.GetProperty("root").GetString(), target=req.GetProperty("target").GetString();
            Need(root!=null&&System.Text.RegularExpressions.Regex.IsMatch(root,@"^[A-Za-z]:\\")&&root.Length>3,"INVALID_ROOT");
            Need(root==Path.GetFullPath(root)&&!root.EndsWith("\\"),"ROOT_ALIAS");
            foreach(string protectedRoot in new[]{Environment.GetFolderPath(Environment.SpecialFolder.Windows),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData)}) {
                Need(!root.Equals(protectedRoot,StringComparison.OrdinalIgnoreCase)&&!root.StartsWith(protectedRoot+"\\",StringComparison.OrdinalIgnoreCase),"PROTECTED_ROOT");
            }
            Need(!root.Equals(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),StringComparison.OrdinalIgnoreCase),"PROTECTED_ROOT");
            Need(target!=null&&target.Length>0&&target.Length<=1024&&!Path.IsPathRooted(target),"INVALID_TARGET");
            string[] targetParts=target.Replace('/','\\').Split('\\'); Need(targetParts.Length<=64,"COMPONENT_LIMIT");
            foreach(string part in root.Substring(3).Split('\\')) ValidateName(part);
            foreach(string part in targetParts) ValidateName(part);
            foreach(string part in targetParts) Need(!new HashSet<string>(StringComparer.OrdinalIgnoreCase){".git",".ssh",".aws",".gnupg",".aexos-transactions"}.Contains(part),"PROTECTED_TARGET");
            string drive=root.Substring(0,3); Need(GetDriveTypeW(drive)==3,"UNSUPPORTED_VOLUME");
            var volume=CreateFileW(drive,DirectoryAccess,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
            Need(!volume.IsInvalid,"VOLUME_UNAVAILABLE"); handles.Add(volume);
            Need((Info(volume).Attr&0x400)==0,"REPARSE_DENIED"); CanonicalPath(volume,drive);
            StringBuilder label=new StringBuilder(261), fileSystem=new StringBuilder(32); uint serial,max,flags;
            Need(GetVolumeInformationByHandleW(volume,label,261,out serial,out max,out flags,fileSystem,32)&&fileSystem.ToString()=="NTFS","UNSUPPORTED_FILESYSTEM");
            SafeFileHandle current=volume;
            foreach(string part in root.Substring(3).Split('\\')) { current=Relative(current,part,true,1,DirectoryAccess,3); handles.Add(current); }
            CanonicalPath(current,root);
            string rootIdentity=Identity(current); var project=current;
            for(int index=0;index<targetParts.Length-1;index++) { current=Relative(current,targetParts[index],true,1,DirectoryAccess,3); handles.Add(current); }
            string parentIdentity=Identity(current), operation=req.GetProperty("operation").GetString();
            Need(operation=="guarded-create"||operation=="guarded-recoverable-replace"||operation=="guarded-recover","INVALID_OPERATION");
            return JsonSerializer.Serialize(ExecuteTransaction(req,project,current,targetParts[targetParts.Length-1],rootIdentity,parentIdentity,serial,handles,tx));
        } catch(NativeFailure error) {
            if(tx.Parked||tx.Published) tx.Phase="RECOVERY_REQUIRED";
            if(tx.Recovery) tx.Phase="RECOVERY_CONFLICT";
            return JsonSerializer.Serialize(tx.Result(false,error.Code));
        } catch {
            if(tx.Parked||tx.Published) tx.Phase="RECOVERY_REQUIRED";
            if(tx.Recovery) tx.Phase="RECOVERY_CONFLICT";
            return JsonSerializer.Serialize(tx.Result(false,"NATIVE_OPERATION_FAILED"));
        } finally { for(int i=handles.Count-1;i>=0;i--) handles[i].Dispose(); }
    }
    static void ValidateName(string name) {
        Need(name.Length>0&&name.Length<=255&&name!="."&&name!=".."&&!name.EndsWith(".")&&!name.EndsWith(" "),"INVALID_COMPONENT");
        Need(!System.Text.RegularExpressions.Regex.IsMatch(name,@"[\x00-\x1f:%]|^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)",System.Text.RegularExpressions.RegexOptions.IgnoreCase),"INVALID_COMPONENT");
    }
}
