using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

// Documented Windows.UI.Shell.TaskbarManager ABI. No Explorer registry hacks.
internal static class TaskbarPin
{
    internal static readonly uint RequestMessage=RegisterWindowMessage("AutomoraDock.Launcher.Pin.Request.v1");
    internal static readonly uint ResultMessage=RegisterWindowMessage("AutomoraDock.Launcher.Pin.Result.v1");
    internal static readonly uint StatusMessage=RegisterWindowMessage("AutomoraDock.Launcher.Pin.Status.v1");
    internal static readonly uint StatusResultMessage=RegisterWindowMessage("AutomoraDock.Launcher.Pin.StatusResult.v1");
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern uint RegisterWindowMessage(string name);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] internal static extern IntPtr FindWindow(string kind,string name);
    [DllImport("user32.dll")] internal static extern bool PostMessage(IntPtr window,uint message,IntPtr w,IntPtr l);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out int pid);
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int pid);
    internal static void AllowForeground(IntPtr window){int pid;GetWindowThreadProcessId(window,out pid);AllowSetForegroundWindow(pid);}
    [DllImport("combase.dll")] static extern int RoInitialize(uint type);
    [DllImport("combase.dll")] static extern void RoUninitialize();
    [DllImport("combase.dll",CharSet=CharSet.Unicode)] static extern int WindowsCreateString(string value,int length,out IntPtr result);
    [DllImport("combase.dll")] static extern int WindowsDeleteString(IntPtr value);
    [DllImport("combase.dll")] static extern int RoGetActivationFactory(IntPtr name,ref Guid iid,out IntPtr result);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int PointerCall(IntPtr self,out IntPtr value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int ByteCall(IntPtr self,out byte value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int IntCall(IntPtr self,out int value);
    static T Method<T>(IntPtr instance,int slot) where T:class {return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance),slot*IntPtr.Size),typeof(T)) as T;}
    static void Check(int hr){Marshal.ThrowExceptionForHR(hr);}
    static async Task<bool> ReadOperation(IntPtr operation)
    {
        IntPtr info=IntPtr.Zero;
        try{
            var iid=new Guid("00000036-0000-0000-c000-000000000046");Check(Marshal.QueryInterface(operation,ref iid,out info));
            var timer=Stopwatch.StartNew();
            while(true){int status;Check(Method<IntCall>(info,7)(info,out status));
                if(status==1){byte result;Check(Method<ByteCall>(operation,8)(operation,out result));return result!=0;}
                if(status==2)return false;
                if(status==3){int error;Check(Method<IntCall>(info,8)(info,out error));Check(error);throw new InvalidOperationException("Windows could not pin the Launcher.");}
                if(timer.ElapsedMilliseconds>100000)throw new TimeoutException("The Windows pin request timed out.");
                await Task.Delay(80);
            }
        }finally{if(info!=IntPtr.Zero)Marshal.Release(info);Marshal.Release(operation);}
    }
    internal static async Task<bool> RequestCurrentLauncher(bool checkOnly=false)
    {
        int initialized=RoInitialize(0);Check(initialized);
        IntPtr name=IntPtr.Zero,factory=IntPtr.Zero,marker=IntPtr.Zero,manager=IntPtr.Zero;
        try{
            const string className="Windows.UI.Shell.TaskbarManager";
            Check(WindowsCreateString(className,className.Length,out name));
            var iid=new Guid("db32ab74-de52-4fe6-b7b6-95ff9f8395df");Check(RoGetActivationFactory(name,ref iid,out factory));
            var desktop=new Guid("cdfefd63-e879-4134-b9a7-8283f05f9480");Check(Marshal.QueryInterface(factory,ref desktop,out marker));
            Check(Method<PointerCall>(factory,6)(factory,out manager));
            byte supported;Check(Method<ByteCall>(manager,6)(manager,out supported));
            if(supported==0)throw new NotSupportedException("Use the Windows shortcut menu to pin this Launcher.");
            IntPtr operation;Check(Method<PointerCall>(manager,8)(manager,out operation));
            bool pinned=await ReadOperation(operation);if(checkOnly||pinned)return pinned;
            byte allowed;Check(Method<ByteCall>(manager,7)(manager,out allowed));
            if(allowed==0)throw new NotSupportedException("Use the Windows shortcut menu to pin this Launcher.");
            Check(Method<PointerCall>(manager,10)(manager,out operation));
            return await ReadOperation(operation);
        }finally{
            if(manager!=IntPtr.Zero)Marshal.Release(manager);if(marker!=IntPtr.Zero)Marshal.Release(marker);if(factory!=IntPtr.Zero)Marshal.Release(factory);if(name!=IntPtr.Zero)WindowsDeleteString(name);RoUninitialize();
        }
    }
    internal static bool ReadPinnedShortcut()
    {
        string folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"Microsoft","Internet Explorer","Quick Launch","User Pinned","TaskBar");
        if(!Directory.Exists(folder))return false;
        object shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
        try{foreach(string file in Directory.GetFiles(folder,"*.lnk")){
            object link=shell.GetType().InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{file});
            try{
                string target=(string)link.GetType().InvokeMember("TargetPath",BindingFlags.GetProperty,null,link,null);
                string arguments=(string)link.GetType().InvokeMember("Arguments",BindingFlags.GetProperty,null,link,null);
                if(!string.IsNullOrEmpty(target)&&string.Equals(Path.GetFullPath(target),Path.Combine(LocalService.Root,"launcher","ProfileDockLauncher.exe"),StringComparison.OrdinalIgnoreCase)&&arguments.IndexOf("--manager",StringComparison.OrdinalIgnoreCase)<0)return true;
            }finally{Marshal.FinalReleaseComObject(link);}
        }return false;}finally{Marshal.FinalReleaseComObject(shell);}
    }
    internal static void ShowShortcut()
    {
        string shortcut=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"Automora Dock","Automora Dock Launcher.lnk");
        if(!File.Exists(shortcut))shortcut=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"Automora Dock Launcher.lnk");
        if(!File.Exists(shortcut))shortcut=Path.Combine(LocalService.Root,"Automora Dock Launcher.lnk");
        if(!File.Exists(shortcut))throw new FileNotFoundException("Launcher shortcut is missing. Run Install-Shortcut.ps1 first.");
        Process.Start(new ProcessStartInfo("explorer.exe","/select,\""+shortcut+"\""){UseShellExecute=true});
    }
}
