using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

internal static class StartupTiming
{
    static readonly Stopwatch clock=Stopwatch.StartNew();
    static readonly DateTime entered=DateTime.UtcNow;
    static readonly DateTime processStarted=Process.GetCurrentProcess().StartTime.ToUniversalTime();
    static readonly List<object> phases=new List<object>();
    static bool completed,background;
    [DllImport("kernel32.dll")] static extern ulong GetTickCount64();
    [DllImport("wtsapi32.dll",CharSet=CharSet.Unicode)] static extern bool WTSQuerySessionInformation(IntPtr server,int session,int kind,out IntPtr buffer,out int bytes);
    [DllImport("wtsapi32.dll")] static extern void WTSFreeMemory(IntPtr buffer);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct SessionInfo {
        public int State,SessionId,IncomingBytes,OutgoingBytes,IncomingFrames,OutgoingFrames,IncomingCompressedBytes,OutgoingCompressedBytes;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string Station;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=17)] public string Domain;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=21)] public string User;
        public long ConnectTime,DisconnectTime,LastInputTime,LogonTime,CurrentTime;
    }
    static DateTime? LogonTime(int session){IntPtr buffer=IntPtr.Zero;int bytes;try{if(WTSQuerySessionInformation(IntPtr.Zero,session,24,out buffer,out bytes)&&bytes>=Marshal.SizeOf(typeof(SessionInfo))){var info=(SessionInfo)Marshal.PtrToStructure(buffer,typeof(SessionInfo));if(info.LogonTime>0)return DateTime.FromFileTimeUtc(info.LogonTime);}}catch{}finally{if(buffer!=IntPtr.Zero)WTSFreeMemory(buffer);}return null;}
    static double Elapsed(){return Math.Round((entered-processStarted).TotalMilliseconds+clock.Elapsed.TotalMilliseconds,1);}
    internal static void Start(bool isBackground){background=isBackground;Mark("process_entry");}
    internal static void Mark(string name){phases.Add(new{name=name,processElapsedMs=Elapsed()});}
    internal static void Ready()
    {
        if(completed)return;completed=true;Mark("usable");
        DateTime readyUtc=DateTime.UtcNow;double elapsed=Elapsed();ulong uptime=GetTickCount64();object[] captured=phases.ToArray();
        // Capture readiness first; write the report off the UI thread afterward.
        Task.Run(()=>{
            string directory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ProfileDock","logs");
            try{
                DateTime bootUtc=readyUtc.AddMilliseconds(-(double)uptime);
                var result=new Dictionary<string,object>{{"format","automora-startup-timing-v1"},{"readyUtc",readyUtc.ToString("O")},{"bootUtcEstimate",bootUtc.ToString("O")},{"processStartedUtc",processStarted.ToString("O")},{"background",background},
                    {"launcherLoadMs",elapsed},{"bootToReadyMs",uptime},{"bootToLauncherStartMs",Math.Round((double)uptime-elapsed,1)},{"phases",captured},
                    {"note","Boot-to-ready includes login waiting time. Explorer start is a process reference, not an exact desktop-visible timestamp."}};
                Directory.CreateDirectory(directory);
                // Persist essential readiness before optional Windows session queries.
                Publish(directory,result,bootUtc,true);
                int session=Process.GetCurrentProcess().SessionId;
                DateTime? logon=LogonTime(session);
                if(logon.HasValue){result["userLogonUtc"]=logon.Value.ToString("O");result["logonToReadyMs"]=Math.Round((readyUtc-logon.Value).TotalMilliseconds,1);result["logonToLauncherStartMs"]=Math.Round((processStarted-logon.Value).TotalMilliseconds,1);}
                DateTime? explorerStarted=null;
                foreach(var process in Process.GetProcessesByName("explorer")){using(process){try{if(process.SessionId==session){DateTime start=process.StartTime.ToUniversalTime();if(!explorerStarted.HasValue||start<explorerStarted.Value)explorerStarted=start;}}catch{}}}
                if(explorerStarted.HasValue){result["explorerStartedUtc"]=explorerStarted.Value.ToString("O");result["explorerStartToReadyMs"]=Math.Round((readyUtc-explorerStarted.Value).TotalMilliseconds,1);}
                Publish(directory,result,bootUtc,false);
            }catch(Exception error){try{Directory.CreateDirectory(directory);File.AppendAllText(Path.Combine(directory,"startup-timing-error.log"),DateTime.UtcNow.ToString("O")+" "+error+Environment.NewLine);}catch{}}
        });
    }
    static void Publish(string directory,Dictionary<string,object> result,DateTime bootUtc,bool history)
    {
        var json=new JavaScriptSerializer();string encoded=json.Serialize(result);
        string latest=Path.Combine(directory,"startup-timing-latest.json"),temporary=latest+".tmp";
        File.WriteAllText(temporary,encoded);if(File.Exists(latest))File.Replace(temporary,latest,null);else File.Move(temporary,latest);
        if(history)File.AppendAllText(Path.Combine(directory,"startup-timing-history.jsonl"),encoded+Environment.NewLine);
        string armed=Path.Combine(directory,"reboot-timing-armed.json"),report=Path.Combine(directory,"reboot-timing-result.json");
        if(!File.Exists(armed))return;
        var state=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(armed));
        DateTime armedUtc=DateTime.Parse((string)state["armedUtc"],null,System.Globalization.DateTimeStyles.RoundtripKind).ToUniversalTime();
        if(bootUtc<=armedUtc)return;
        if(File.Exists(report)){var previous=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(report));if((string)previous["readyUtc"]!=(string)result["readyUtc"])return;}
        File.WriteAllText(report,encoded);
        File.WriteAllText(Path.Combine(directory,"reboot-timing-result.txt"),"Automora Dock actual restart measurement"+Environment.NewLine+encoded);
    }
}
