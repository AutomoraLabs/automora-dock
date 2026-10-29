using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class ManagerHost
{
    internal static readonly uint RevealMessage=RegisterWindowMessage("ProfileDock.Manager.Reveal.v1");
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern uint RegisterWindowMessage(string text);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string className,string title);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window,uint message,IntPtr wParam,IntPtr lParam);
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int pid);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out int pid);
    private delegate bool WindowCallback(IntPtr window,IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback,IntPtr data);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window,StringBuilder text,int size);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window,StringBuilder text,int size);
    private static IntPtr FindManager()
    {
        IntPtr found=IntPtr.Zero;EnumWindows((window,data)=>{var title=new StringBuilder(128);var kind=new StringBuilder(128);GetWindowText(window,title,128);GetClassName(window,kind,128);if(title.ToString()=="Automora Dock"&&kind.ToString().StartsWith("WindowsForms10",StringComparison.Ordinal)){found=window;return false;}return true;},IntPtr.Zero);return found;
    }
    [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern int SetCurrentProcessExplicitAppUserModelID(string id);
    internal static void Run(bool background=false)
    {
        SetCurrentProcessExplicitAppUserModelID("ProfileDock.Manager");
        bool first;
        using(var mutex=new Mutex(true,"Local\\ProfileDock.Manager.v1",out first)){
            if(!first){
                if(background)return;
                for(int attempt=0;attempt<50;attempt++){
                    IntPtr window=FindManager();
                    if(window!=IntPtr.Zero){int pid;GetWindowThreadProcessId(window,out pid);AllowSetForegroundWindow(pid);PostMessage(window,RevealMessage,IntPtr.Zero,IntPtr.Zero);return;}
                    Thread.Sleep(100);
                }
                return;
            }
            Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new ManagerWindow(background));GC.KeepAlive(mutex);
        }
    }
}

internal static class LocalService
{
    internal static readonly string Root=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,".."));
    internal static readonly string Data=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ProfileDock");
    internal static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=25000000};
    internal static async Task<bool> Ready()
    {
        if(!await PortOpen())return false;
        try{using(var client=new HttpClient(new HttpClientHandler{UseProxy=false})){
            client.Timeout=TimeSpan.FromSeconds(2);
            var response=Json.Deserialize<Dictionary<string,object>>(await client.GetStringAsync("http://127.0.0.1:1420/api/health"));
            return response.ContainsKey("application")&&(string)response["application"]=="ProfileDock"&&response.ContainsKey("storageReady")&&(bool)response["storageReady"];
        }}catch{return false;}
    }
    internal static async Task<bool> PortOpen()
    {
        try{using(var socket=new System.Net.Sockets.TcpClient()){
            var connect=socket.ConnectAsync("127.0.0.1",1420);
            if(await Task.WhenAny(connect,Task.Delay(120))!=connect)return false;
            await connect;return socket.Connected;
        }}catch{return false;}
    }
    internal static async Task Ensure()
    {
        if(await Ready())return;
        string node=Path.Combine(Root,"runtime","node.exe");
        if(!File.Exists(node)){
            foreach(string directory in (Environment.GetEnvironmentVariable("PATH")??"").Split(Path.PathSeparator)){
                try{string candidate=Path.Combine(directory.Trim('"'),"node.exe");if(File.Exists(candidate)){node=candidate;break;}}catch{}
            }
        }
        if(!File.Exists(node))throw new FileNotFoundException("Automora Dock runtime is missing. Reinstall the application.");
        string script=Path.Combine(Root,"dev","server.mjs");
        if(!File.Exists(script)||!File.Exists(Path.Combine(Root,"dist","index.html")))throw new FileNotFoundException("Automora Dock application files are incomplete. Reinstall the application.");
        Process.Start(new ProcessStartInfo(node,"\""+script+"\" --production"){WorkingDirectory=Root,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});
        for(int attempt=0;attempt<80;attempt++){if(await Ready())return;await Task.Delay(250);}
        throw new InvalidOperationException("The saved library could not start. Retry, or check Automora Dock logs.");
    }
    internal static async Task<object> Command(string command,Dictionary<string,object> args)
    {
        using(var client=new HttpClient(new HttpClientHandler{UseProxy=false})){
            client.Timeout=TimeSpan.FromSeconds(20);
            var session=Json.Deserialize<Dictionary<string,object>>(await client.GetStringAsync("http://127.0.0.1:1420/api/session"));
            client.DefaultRequestHeaders.Add("Origin","http://127.0.0.1:1420");client.DefaultRequestHeaders.Add("X-ProfileDock-Token",(string)session["token"]);
            using(var body=new StringContent(Json.Serialize(new{command=command,args=args}),Encoding.UTF8,"application/json"))
            using(var response=await client.PostAsync("http://127.0.0.1:1420/api/command",body)){
                var payload=Json.Deserialize<Dictionary<string,object>>(await response.Content.ReadAsStringAsync());
                if(!response.IsSuccessStatusCode)throw new InvalidOperationException(payload.ContainsKey("error")?(string)payload["error"]:"Action failed.");return payload["result"];
            }
        }
    }
}

internal sealed class ManagerWindow:Form
{
    private WebView2 browser;
    private readonly Label loading;
    private bool initializing,closing,picking,openRequested,scheduled,ready;
    private TaskCompletionSource<int> pinCompletion;
    private TaskCompletionSource<int> pinStatusCompletion;
    private int pinStatusGeneration;
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
    public ManagerWindow(bool background)
    {
        openRequested=!background;
        Text="Automora Dock";Icon=new Icon(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"AutomoraDock-main.ico"));StartPosition=FormStartPosition.CenterScreen;
        MinimumSize=new Size(800,600);Size=new Size(Math.Min(1380,Screen.PrimaryScreen.WorkingArea.Width),Math.Min(900,Screen.PrimaryScreen.WorkingArea.Height));
        BackColor=Color.FromArgb(247,248,250);
        loading=new Label{Dock=DockStyle.Fill,Text="Opening your library…",TextAlign=ContentAlignment.MiddleCenter,Font=new Font("Segoe UI",12),ForeColor=Color.FromArgb(65,70,85),Cursor=Cursors.Hand};Controls.Add(loading);
        loading.Click+=async delegate{await Initialize();};FormClosing+=delegate(object sender,FormClosingEventArgs args){if(args.CloseReason==CloseReason.UserClosing){args.Cancel=true;openRequested=false;Hide();DebugState();return;}closing=true;};
    }
    protected override void SetVisibleCore(bool value){if(value&&!openRequested){if(!IsHandleCreated)CreateHandle();base.SetVisibleCore(false);return;}base.SetVisibleCore(value);}
    protected override void OnHandleCreated(EventArgs args){base.OnHandleCreated(args);if(!scheduled){scheduled=true;BeginInvoke(new Action(async()=>await Initialize()));}}
    protected override void WndProc(ref Message message)
    {
        if((uint)message.Msg==TaskbarPin.StatusResultMessage){if(pinStatusCompletion!=null&&message.LParam.ToInt32()==pinStatusGeneration)pinStatusCompletion.TrySetResult(message.WParam.ToInt32());return;}
        if((uint)message.Msg==TaskbarPin.ResultMessage){if(pinCompletion!=null)pinCompletion.TrySetResult(message.WParam.ToInt32());return;}
        if(message.Msg==ManagerHost.RevealMessage){openRequested=true;if(WindowState==FormWindowState.Minimized)ShowWindow(Handle,9);Show();Activate();SetForegroundWindow(Handle);if(browser!=null&&browser.Visible)browser.Focus();DebugState();RefreshConnection();return;}
        base.WndProc(ref message);
    }
    private async Task Initialize()
    {
        if(initializing||closing)return;initializing=true;
        try{
            await LocalService.Ensure();if(closing)return;
            if(browser!=null){Controls.Remove(browser);browser.Dispose();}
            browser=new WebView2{Dock=DockStyle.Fill,DefaultBackgroundColor=BackColor,Visible=false};Controls.Add(browser);
            var options=new CoreWebView2EnvironmentOptions();int port;
            if(int.TryParse(Environment.GetEnvironmentVariable("PROFILEDOCK_DEBUG_PORT"),out port)&&port>1024&&port<65536)options.AdditionalBrowserArguments="--remote-debugging-port="+port+" --remote-debugging-address=127.0.0.1";
            var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(LocalService.Data,"launcher-webview"),options);await browser.EnsureCoreWebView2Async(environment);
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;browser.CoreWebView2.Settings.IsStatusBarEnabled=false;browser.CoreWebView2.Settings.AreDevToolsEnabled=!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PROFILEDOCK_DEBUG_PORT"));
            browser.CoreWebView2.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs args){Uri uri;if(!Uri.TryCreate(args.Uri,UriKind.Absolute,out uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.Port!=1420)args.Cancel=true;};
            browser.CoreWebView2.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs args){args.Handled=true;};
            browser.CoreWebView2.NavigationCompleted+=delegate(object sender,CoreWebView2NavigationCompletedEventArgs args){if(closing)return;if(!args.IsSuccess){Error(new InvalidOperationException("The main window could not load: "+args.WebErrorStatus));return;}loading.Visible=false;browser.Visible=true;browser.BringToFront();};
            browser.CoreWebView2.ProcessFailed+=delegate{if(!closing)BeginInvoke(new Action(()=>Error(new InvalidOperationException("The app renderer stopped. Click to reload your saved library."))));};
            browser.CoreWebView2.WebMessageReceived+=async delegate(object sender,CoreWebView2WebMessageReceivedEventArgs args){
                if(!args.Source.StartsWith("http://127.0.0.1:1420/",StringComparison.Ordinal))return;
                string message=args.TryGetWebMessageAsString();if(message.StartsWith("ready",StringComparison.Ordinal)){ready=true;DebugState();return;}if(!message.StartsWith("{"))return;
                var request=LocalService.Json.Deserialize<Dictionary<string,object>>(message);
                if(!request.ContainsKey("type"))return;
                if((string)request["type"]=="launcher-pin-status"){
                    string statusId=(string)request["id"];object statusResult=null;string statusError=null;
                    try{statusResult=await ReadLauncherPinStatus();}catch(Exception error){statusError=error.Message;}
                    if(!closing&&browser!=null&&browser.CoreWebView2!=null)browser.CoreWebView2.PostWebMessageAsJson(LocalService.Json.Serialize(new{type="launcher-pin-status-result",id=statusId,result=statusResult,error=statusError}));return;
                }
                if((string)request["type"]=="pin-launcher"){
                    string pinId=(string)request["id"];object pinResult=null;string pinError=null;
                    try{pinResult=await RequestLauncherPin();}catch(Exception error){pinError=error.Message;}
                    if(!closing&&browser!=null&&browser.CoreWebView2!=null)browser.CoreWebView2.PostWebMessageAsJson(LocalService.Json.Serialize(new{type="pin-launcher-result",id=pinId,result=pinResult,error=pinError}));return;
                }
                if((string)request["type"]!="folder-pick")return;
                string id=(string)request["id"];object result=null;string failure=null;
                try{
                    if(picking)throw new InvalidOperationException("A folder picker is already open.");
                    picking=true;await Task.Delay(1);Activate();SetForegroundWindow(Handle);
                    using(var picker=new FolderBrowserDialog{Description="Choose a favourite folder for Automora Dock",ShowNewFolderButton=false}){
                        bool selected=picker.ShowDialog(this)==DialogResult.OK;
                        result=await LocalService.Command("favorite_folder",selected?new Dictionary<string,object>{{"action","folder-add"},{"path",picker.SelectedPath}}:new Dictionary<string,object>{{"action","folder-list"}});
                    }
                }catch(Exception error){failure=error.Message;}finally{picking=false;if(!closing){Activate();SetForegroundWindow(Handle);}}
                if(!closing&&browser!=null&&browser.CoreWebView2!=null)browser.CoreWebView2.PostWebMessageAsJson(LocalService.Json.Serialize(new{type="folder-pick-result",id=id,result=result,error=failure}));
            };
            browser.CoreWebView2.Navigate("http://127.0.0.1:1420/");
        }catch(Exception error){if(!closing)Error(error);}finally{initializing=false;}
    }
    private async void RefreshConnection(){try{await LocalService.Ensure();if(!closing&&browser!=null&&browser.CoreWebView2!=null)await browser.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('profiledock:refresh'));");}catch(Exception error){if(!closing)Error(error);}}
    private async Task<object> RequestLauncherPin()
    {
        if(pinCompletion!=null)throw new InvalidOperationException("A Launcher pin request is already open.");
        pinCompletion=new TaskCompletionSource<int>();
        try{
            IntPtr launcher=TaskbarPin.FindWindow(null,"Automora Dock Launcher");
            if(launcher==IntPtr.Zero){Process.Start(new ProcessStartInfo(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ProfileDockLauncher.exe"),"--background"){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});
                for(int attempt=0;attempt<100&&launcher==IntPtr.Zero;attempt++){await Task.Delay(50);launcher=TaskbarPin.FindWindow(null,"Automora Dock Launcher");}}
            if(launcher==IntPtr.Zero)throw new InvalidOperationException("The Launcher could not start. Please try again.");
            TaskbarPin.AllowForeground(launcher);
            if(!TaskbarPin.PostMessage(launcher,TaskbarPin.RequestMessage,IntPtr.Zero,Handle))throw new InvalidOperationException("The Launcher could not receive the pin request.");
            var completed=await Task.WhenAny(pinCompletion.Task,Task.Delay(115000));
            if(completed!=pinCompletion.Task)throw new TimeoutException("The Windows pin request timed out. Please try again.");
            int result=await pinCompletion.Task;
            if(result==3)throw new InvalidOperationException("Windows could not open the Launcher pin request. Please try again.");
            return new{status=result==1?"pinned":result==2?"shortcut":"cancelled"};
        }finally{pinCompletion=null;}
    }
    private async Task<object> ReadLauncherPinStatus()
    {
        if(pinStatusCompletion!=null){int existing=await pinStatusCompletion.Task;return new{pinned=existing==2?(bool?)null:existing==1};}
        pinStatusCompletion=new TaskCompletionSource<int>();var completion=pinStatusCompletion;int generation=++pinStatusGeneration;
        try{
            IntPtr launcher=TaskbarPin.FindWindow(null,"Automora Dock Launcher");
            if(launcher==IntPtr.Zero){Process.Start(new ProcessStartInfo(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ProfileDockLauncher.exe"),"--background"){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});
                for(int attempt=0;attempt<100&&launcher==IntPtr.Zero;attempt++){await Task.Delay(50);launcher=TaskbarPin.FindWindow(null,"Automora Dock Launcher");}}
            if(launcher==IntPtr.Zero||!TaskbarPin.PostMessage(launcher,TaskbarPin.StatusMessage,new IntPtr(generation),Handle))return new{pinned=(bool?)null};
            if(await Task.WhenAny(completion.Task,Task.Delay(12000))!=completion.Task)return new{pinned=(bool?)null};
            int result=await completion.Task;return new{pinned=result==2?(bool?)null:result==1};
        }finally{completion.TrySetResult(2);pinStatusCompletion=null;}
    }
    private void Error(Exception error)
    {
        if(browser!=null)browser.Visible=false;loading.Visible=true;loading.BringToFront();loading.Text="Automora Dock could not open.\n\n"+error.Message+"\n\nClick here to retry. Your saved library is preserved.";
        try{string logs=Path.Combine(LocalService.Data,"logs");Directory.CreateDirectory(logs);File.AppendAllText(Path.Combine(logs,"manager.log"),DateTime.UtcNow.ToString("O")+" "+error+Environment.NewLine);}catch{}
    }
    private void DebugState(){if(string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PROFILEDOCK_DEBUG_PORT")))return;try{string logs=Path.Combine(LocalService.Data,"logs");Directory.CreateDirectory(logs);File.WriteAllText(Path.Combine(logs,"manager-debug.json"),LocalService.Json.Serialize(new{ready=ready,visible=Visible,pid=Process.GetCurrentProcess().Id}));}catch{}}
    protected override void Dispose(bool disposing){if(disposing&&browser!=null)browser.Dispose();base.Dispose(disposing);}
}
