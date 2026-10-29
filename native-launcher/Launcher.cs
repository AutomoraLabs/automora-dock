using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("Automora Dock")]
[assembly: AssemblyProduct("Automora Dock")]
[assembly: AssemblyVersion("0.4.0.0")]
[assembly: AssemblyFileVersion("0.4.0.0")]

internal static class Program
{
    internal static readonly uint RevealMessage = RegisterWindowMessage("ProfileDock.Launcher.Reveal.v1");
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SetCurrentProcessExplicitAppUserModelID(string id);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterWindowMessage(string text);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string className, string title);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int processId);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out int processId);
    [STAThread]
    static void Main(string[] args)
    {
        if(Path.GetFileNameWithoutExtension(Application.ExecutablePath).Equals("AutomoraDock",StringComparison.OrdinalIgnoreCase)||Array.Exists(args,a=>a=="--manager"||a=="--manager-background")){ManagerHost.Run(Array.Exists(args,a=>a=="--manager-background"));return;}
        SetCurrentProcessExplicitAppUserModelID("ProfileDock.Launcher");
        bool first;
        using (var mutex = new Mutex(true, "Local\\ProfileDock.Launcher.v1", out first))
        {
            if (!first)
            {
                if (Array.Exists(args, a => a == "--background")&&!Array.Exists(args,a=>a=="--pin-after-install")) return;
                for (int i = 0; i < 30; i++)
                {
                    IntPtr window = FindWindow(null, "Automora Dock Launcher");
                    if (window != IntPtr.Zero)
                    {
                        int processId; GetWindowThreadProcessId(window, out processId);
                        AllowSetForegroundWindow(processId);
                        PostMessage(window, Array.Exists(args,a=>a=="--pin-after-install")?TaskbarPin.RequestMessage:RevealMessage, IntPtr.Zero, IntPtr.Zero);
                        return;
                    }
                    Thread.Sleep(100);
                }
                return;
            }
            Application.EnableVisualStyles();
            StartupTiming.Start(Array.Exists(args,a=>a=="--background"));
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherWindow(Array.Exists(args, a => a == "--background"),Array.Exists(args,a=>a=="--pin-after-install")));
            GC.KeepAlive(mutex);
        }
    }
}

internal static class TaskbarButton
{
    [ComImport, Guid("56FDF344-FD6D-11d0-958A-006097C9A090")] private class TaskbarList { }
    [ComImport, Guid("56FDF342-FD6D-11d0-958A-006097C9A090"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] private interface ITaskbarList
    {
        void HrInit(); void AddTab(IntPtr window); void DeleteTab(IntPtr window); void ActivateTab(IntPtr window); void SetActiveAlt(IntPtr window);
    }
    internal static void Add(IntPtr window)
    {
        object instance = new TaskbarList();
        try { var list = (ITaskbarList)instance; list.HrInit(); list.AddTab(window); }
        finally { Marshal.FinalReleaseComObject(instance); }
    }
}

internal sealed class LauncherWindow : Form
{
    private readonly string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
    private readonly string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ProfileDock");
    private WebView2 browser;
    private readonly Label loading;
    private readonly System.Windows.Forms.Timer motion = new System.Windows.Forms.Timer();
    private readonly Stopwatch animationClock = new Stopwatch();
    private readonly Stopwatch dismissedAt = new Stopwatch();
    private bool closing, shownOnce, animationsEnabled = true;
    private Point motionFrom, motionTo;
    private int motionDuration;
    private int animationFrames;
    private bool taskbarRegistered;
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr window,int index);
    private Rectangle targetBounds;
    private readonly uint taskbarCreated = RegisterWindowMessage("TaskbarCreated");
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern uint RegisterWindowMessage(string name);
    [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action,uint parameter,out bool value,uint flags);
    [DllImport("dwmapi.dll")] static extern int DwmFlush();
    private bool ready, initializing, exiting, revealing;
    private bool managerPrewarmed;
    private bool pendingInstallPin;
    private readonly System.Windows.Forms.Timer managerWarmup = new System.Windows.Forms.Timer();
    private bool openRequested;
    private bool nativeDialog;
    private readonly System.Windows.Forms.Timer loadTimeout = new System.Windows.Forms.Timer();

    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int processId);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window,int command);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window,StringBuilder name,int count);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out int processId);
    private delegate bool EnumWindowCallback(IntPtr window,IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowCallback callback,IntPtr parameter);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);

    public LauncherWindow(bool background,bool installPin=false)
    {
        pendingInstallPin=installPin;
        StartupTiming.Mark("window_constructed");
        openRequested = !background;
        Text = "Automora Dock Launcher";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        MinimizeBox = false;
        MaximizeBox = false;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Color.FromArgb(16, 19, 22);
        Icon = new Icon(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"AutomoraDock-launcher.ico"));
        loading = new Label { Text = "Opening your pinned library…", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.FromArgb(200, 205, 215), Font = new Font("Segoe UI", 11) };
        Controls.Add(loading);
        SystemParametersInfo(0x1042,0,out animationsEnabled,0);
        motion.Interval = 15;
        managerWarmup.Interval=6000;
        managerWarmup.Tick+=delegate{managerWarmup.Stop();if(!exiting)try{Process.Start(new ProcessStartInfo(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"AutomoraDock.exe"),"--manager-background"){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});}catch(Exception error){Log(error);}};
        motion.Tick += delegate { AnimateFrame(); };
        loadTimeout.Interval = 25000;
        loadTimeout.Tick += delegate { loadTimeout.Stop(); if (!ready) ShowError(new InvalidOperationException("The library took too long to load. Click here to retry.")); };
        loading.Cursor = Cursors.Hand;
        loading.Click += async delegate { if (!initializing && !ready) await InitializeAsync(); };
        Shown += delegate { BeginInvoke(new Action(async () => { SetCloak(true); await InitializeAsync(); })); };
        Deactivate += delegate { if (ready && !revealing && !exiting && !nativeDialog) Dismiss(); };
        FormClosing += delegate { exiting = true; motion.Stop(); };
        PositionPopup();
    }

    protected override CreateParams CreateParams
    {
        get { var value = base.CreateParams; value.Style &= ~(0x20000 | 0x80000); value.ExStyle = (value.ExStyle & ~0x40000) | 0x80; value.ClassStyle |= 0x20000; return value; }
    }
    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        int disabled = 1;
        try { DwmSetWindowAttribute(Handle,3,ref disabled,4); } catch { }
        SetCloak(true);
    }
    protected override void WndProc(ref Message message)
    {
        if ((uint)message.Msg == TaskbarPin.StatusMessage) { ReadPinStatus(message.LParam,message.WParam); return; }
        if ((uint)message.Msg == TaskbarPin.RequestMessage) { PinLauncher(message.LParam); return; }
        if ((uint)message.Msg == Program.RevealMessage) { ToggleFromTaskbar(); return; }
        if ((uint)message.Msg == taskbarCreated) { RegisterTaskbar(); }
        if (ready && message.Msg == 0x112)
        {
            long action = message.WParam.ToInt64() & 0xFFF0;
            if (action == 0xF120) { RestoreFromTaskbar(); return; }
            if (action == 0xF020) { Dismiss(); return; }
        }
        base.WndProc(ref message);
    }
    private bool pinningLauncher;
    private async void ReadPinStatus(IntPtr replyWindow,IntPtr generation)
    {
        int status=2;
        try{status=await TaskbarPin.RequestCurrentLauncher(true)?1:0;}
        catch{try{status=TaskbarPin.ReadPinnedShortcut()?1:0;}catch{}}
        TaskbarPin.PostMessage(replyWindow,TaskbarPin.StatusResultMessage,new IntPtr(status),generation);
    }
    private async void PinLauncher(IntPtr replyWindow)
    {
        if(pinningLauncher){TaskbarPin.PostMessage(replyWindow,TaskbarPin.ResultMessage,new IntPtr(3),IntPtr.Zero);return;}
        pinningLauncher=true;nativeDialog=true;int result=0;
        try{
            for(int attempt=0;!ready&&attempt<600;attempt++)await Task.Delay(50);
            if(!ready)throw new InvalidOperationException("The Launcher is still starting.");
            openRequested=true;Reveal();for(int attempt=0;revealing&&attempt<250;attempt++)await Task.Delay(20);
            if(!Visible||revealing)throw new InvalidOperationException("The Launcher could not become visible.");
            await Task.Delay(180);Activate();SetForegroundWindow(Handle);
            result=await TaskbarPin.RequestCurrentLauncher()?1:0;
        }catch(Exception error){Log(error);try{TaskbarPin.ShowShortcut();result=2;if(replyWindow==IntPtr.Zero){var help=new Thread(()=>MessageBox.Show("Right-click the selected Automora Dock Launcher shortcut, choose Show more options if shown, then Pin to taskbar.","Pin Launcher to taskbar",MessageBoxButtons.OK,MessageBoxIcon.Information));help.IsBackground=true;help.SetApartmentState(ApartmentState.STA);help.Start();}}catch(Exception fallback){Log(fallback);result=3;}}
        finally{
            try{string logs=Path.Combine(data,"logs");Directory.CreateDirectory(logs);File.AppendAllText(Path.Combine(logs,"pin-flow.jsonl"),new JavaScriptSerializer().Serialize(new{utc=DateTime.UtcNow.ToString("O"),source=replyWindow==IntPtr.Zero?"setup":"app",result=result,applicationRoot=root})+Environment.NewLine);}catch{}
            nativeDialog=false;pinningLauncher=false;Dismiss();if(replyWindow!=IntPtr.Zero)TaskbarPin.PostMessage(replyWindow,TaskbarPin.ResultMessage,new IntPtr(result),IntPtr.Zero);
        }
    }
    private void RegisterTaskbar() { try { TaskbarButton.Add(Handle);taskbarRegistered=true; } catch (Exception error) { Log(error); } }
    private void SetCloak(bool enabled) { int value=enabled?1:0;try { DwmSetWindowAttribute(Handle,13,ref value,4);DwmFlush(); } catch { } }
    private Rectangle PopupBounds()
    {
        Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea;
        float scale; using (Graphics graphics = CreateGraphics()) scale = graphics.DpiX / 96f;
        int width = Math.Min((int)(620 * scale), area.Width - 24);
        int height = Math.Min((int)(780 * scale), area.Height - 24);
        return new Rectangle(area.Left + 12, area.Bottom - height - 10, width, height);
    }
    private void PositionPopup() { targetBounds=PopupBounds();Bounds=targetBounds; }
    private void StartMotion(Point from, Point to, int duration)
    {
        motion.Stop();motionFrom=from;motionTo=to;motionDuration=duration;
        if(!animationsEnabled){Location=to;CompleteMotion();return;}
        animationClock.Restart();motion.Start();
    }
    private void AnimateFrame()
    {
        animationFrames++;
        double t=Math.Min(1,animationClock.Elapsed.TotalMilliseconds/motionDuration);
        double eased=closing?t*t:1-Math.Pow(1-t,3);
        Location=new Point((int)Math.Round(motionFrom.X+(motionTo.X-motionFrom.X)*eased),(int)Math.Round(motionFrom.Y+(motionTo.Y-motionFrom.Y)*eased));
        if(t>=1){motion.Stop();CompleteMotion();}
    }
    private void CompleteMotion()
    {
        if(!closing)return;
        Hide();closing=false;DebugState();
    }
    private void Dismiss()
    {
        DebugTrace("dismiss");
        if(exiting||closing||!Visible)return;
        ClosePopups();
        openRequested=false;
        dismissedAt.Restart();
        closing=true;revealing=false;
        StartMotion(Location,new Point(targetBounds.X,targetBounds.Y+22),130);
    }
    // Explorer can deliver deactivation, minimize, restore and a shortcut launch
    // for the same taskbar click. A close wins over its trailing activation.
    private bool ClosingGesture { get { return closing || (dismissedAt.IsRunning && dismissedAt.ElapsedMilliseconds < 350); } }
    private void ToggleFromTaskbar()
    {
        DebugTrace("toggle");
        if(exiting || nativeDialog || ClosingGesture)return;
        if(Visible && shownOnce) Dismiss();
        else Reveal();
    }
    private void RestoreFromTaskbar()
    {
        DebugTrace("restore");
        if(exiting || nativeDialog || ClosingGesture)return;
        Reveal();
    }
    private async void Reveal()
    {
        DebugTrace("reveal");
        openRequested=true;
        if(exiting||revealing)return;
        if(!ready && initializing)return;
        revealing=true;
        try
        {
            bool animate=!shownOnce||!Visible||WindowState==FormWindowState.Minimized||closing;
            closing=false;motion.Stop();
            if(animate)
            {
                SetCloak(true);WindowState=FormWindowState.Normal;targetBounds=PopupBounds();
                Bounds=new Rectangle(targetBounds.X,targetBounds.Y+24,targetBounds.Width,targetBounds.Height);
                Show();
                if(ready)
                {
                    await EnsureServer();
                    string prepared=await browser.CoreWebView2.ExecuteScriptAsync("(()=>{window.dispatchEvent(new Event('profiledock:refresh'));document.querySelector('[aria-label=\"Search bookmarks\"]')?.focus({preventScroll:true});void document.body.offsetHeight;const main=document.querySelector('main'),folders=document.querySelector('.favorite-folder-list');return {main:main?.scrollTop||0,folderX:folders?.scrollLeft||0,folderY:folders?.scrollTop||0};})()");
                    if(!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PROFILEDOCK_DEBUG_PORT"))){Directory.CreateDirectory(Path.Combine(data,"logs"));File.WriteAllText(Path.Combine(data,"logs","reveal-prepared.json"),prepared);}
                    // Allow the renderer to commit the prepared viewport while cloaked.
                    await Task.Delay(32);
                }
                if(exiting || closing || !openRequested)return;
                SetCloak(false);RegisterTaskbar();
                StartMotion(Location,targetBounds.Location,180);
            }
            Show();Activate();SetForegroundWindow(Handle);shownOnce=true;revealing=false;DebugState();
            if(ready)
            {
                await EnsureServer();
                if(!closing&&WindowState==FormWindowState.Normal&&ActiveForm==this)
                {
                    browser.Focus();
                    // Viewport preparation already ran before the reveal animation.
                }
            }
            else await InitializeAsync();
        }
        catch(Exception error){ShowError(error);}
        finally{revealing=false;}
    }
    private async void ClosePopups()
    {
        try{if(ready && browser!=null && browser.CoreWebView2!=null)await browser.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('profiledock:close-popups'));");}catch(Exception error){if(!exiting)Log(error);}
    }
    private async Task<bool> ServerReady()
    {
        if(!await LocalService.PortOpen())return false;
        try
        {
            using (var client = new HttpClient(new HttpClientHandler { UseProxy = false }))
            {
                client.Timeout = TimeSpan.FromSeconds(2);
                string response = await client.GetStringAsync("http://127.0.0.1:1420/api/health");
                var health=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(response);
                return health.ContainsKey("application") && (string)health["application"]=="ProfileDock" && health.ContainsKey("storageReady") && (bool)health["storageReady"];
            }
        }
        catch { return false; }
    }
    private string FindNode()
    {
        string packaged = Path.Combine(root,"runtime","node.exe");
        if(File.Exists(packaged))return packaged;
        foreach (string directory in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            try { string candidate = Path.Combine(directory.Trim('"'), "node.exe"); if (File.Exists(candidate)) return candidate; } catch { }
        }
        throw new InvalidOperationException("Node.js 24 or newer is required. Install Node.js, then reopen Automora Dock Launcher.");
    }
    private async Task EnsureServer()
    {
        if (await ServerReady()) return;
        string script = Path.Combine(root, "dev", "server.mjs");
        if (!File.Exists(script) || !File.Exists(Path.Combine(root, "dist", "index.html"))) throw new FileNotFoundException("Automora Dock files are missing. Keep the launcher folder inside the application directory.");
        var start = new ProcessStartInfo(FindNode(), "\"" + script + "\" --production") { WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden };
        Process.Start(start);
        for (int i = 0; i < 40; i++) { if (await ServerReady()) return; await Task.Delay(250); }
        throw new InvalidOperationException("The local Automora Dock service did not start. Check whether port 1420 is already in use.");
    }
    private async Task InitializeAsync()
    {
        if (initializing || ready) return;
        initializing = true;
        StartupTiming.Mark("initialization_started");
        loadTimeout.Start();
        try
        {
            await EnsureServer();
            StartupTiming.Mark("service_ready");
            if(browser!=null){Controls.Remove(browser);browser.Dispose();browser=null;}
            browser = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = BackColor, Visible = false };
            Controls.Add(browser); browser.BringToFront();
            var options = new CoreWebView2EnvironmentOptions();
            int port;
            if (int.TryParse(Environment.GetEnvironmentVariable("PROFILEDOCK_DEBUG_PORT"), out port) && port > 1024 && port < 65536)
                options.AdditionalBrowserArguments = "--remote-debugging-port=" + port + " --remote-debugging-address=127.0.0.1";
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(data, "launcher-webview"), options);
            await browser.EnsureCoreWebView2Async(environment);
            StartupTiming.Mark("webview_ready");
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.Settings.AreDevToolsEnabled = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PROFILEDOCK_DEBUG_PORT"));
            browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            browser.CoreWebView2.Settings.IsZoomControlEnabled = false;
            browser.CoreWebView2.ProcessFailed += delegate { BeginInvoke(new Action(() => { if(!exiting) ShowError(new InvalidOperationException("The menu renderer stopped. Click here to reload your saved library.")); })); };
            browser.CoreWebView2.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args) { args.Handled = true; };
            browser.CoreWebView2.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs args)
            {
                Uri uri; if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out uri) || uri.Scheme != "http" || uri.Host != "127.0.0.1" || uri.Port != 1420) args.Cancel = true;
            };
            browser.CoreWebView2.WebMessageReceived += async delegate(object sender, CoreWebView2WebMessageReceivedEventArgs args)
            {
                if (!args.Source.StartsWith("http://127.0.0.1:1420/", StringComparison.Ordinal)) return;
                try
                {
                    string message = args.TryGetWebMessageAsString();
                    if(message.StartsWith("{",StringComparison.Ordinal))
                    {
                        var json=new JavaScriptSerializer();
                        var request=json.Deserialize<Dictionary<string,object>>(message);
                        string requestType=request.ContainsKey("type")?request["type"] as string:null;
                        if(requestType=="open-link")
                        {
                            string id=(string)request["id"];
                            try{
                                string url=(string)((Dictionary<string,object>)request["args"])["url"];
                                if(url!="https://automoralabs.store/"&&url!="https://buymeacoffee.com/rishichaurasiya")throw new InvalidOperationException("This link is not available.");
                                Process.Start(new ProcessStartInfo(url){UseShellExecute=true});
                                browser.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{type="open-link-result",id=id,result=new{opened=true}}));
                            }catch(Exception error){browser.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{type="open-link-result",id=id,error=error.Message}));}
                            return;
                        }
                        if(requestType!=null && requestType.StartsWith("folder-",StringComparison.Ordinal))
                        {
                            string id=(string)request["id"];
                            // Leave WebView's callback before opening a modal picker.
                            if(requestType=="folder-add")await Task.Delay(1);
                            try {
                                object result=requestType=="folder-copy"?await CopyFolderPath((Dictionary<string,object>)request["args"]):await HandleFolderRequest(requestType,(Dictionary<string,object>)request["args"]);
                                browser.CoreWebView2.PostWebMessageAsJson(json.Serialize(new {type=requestType+"-result",id=id,result=result}));
                            }catch(Exception error){browser.CoreWebView2.PostWebMessageAsJson(json.Serialize(new {type=requestType+"-result",id=id,error=error.Message}));}
                            return;
                        }
                        if(request.ContainsKey("type") && (string)request["type"]=="launch")
                        {
                            string id=(string)request["id"];
                            try { await LaunchChrome((Dictionary<string,object>)request["args"]);browser.CoreWebView2.PostWebMessageAsJson(json.Serialize(new {type="launch-result",id=id,result=new {requested=true}})); }
                            catch(Exception error){browser.CoreWebView2.PostWebMessageAsJson(json.Serialize(new {type="launch-result",id=id,error=error.Message}));}
                            return;
                        }
                    }
                    if(message=="test:close-race"&&!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PROFILEDOCK_DEBUG_PORT")))
                    {
                        Dismiss();RestoreFromTaskbar();ToggleFromTaskbar();
                        await Task.Delay(220);if(!exiting){RestoreFromTaskbar();ToggleFromTaskbar();}return;
                    }
                    if(message=="diagnostics"&&!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PROFILEDOCK_DEBUG_PORT")))
                    {
                        long style=GetWindowLongPtr(Handle,-20).ToInt64();
                        browser.CoreWebView2.PostWebMessageAsJson("{\"type\":\"diagnostics\",\"visible\":"+Visible.ToString().ToLowerInvariant()+",\"state\":\""+WindowState+"\",\"tool\":"+((style&0x80)!=0).ToString().ToLowerInvariant()+",\"appWindow\":"+((style&0x40000)!=0).ToString().ToLowerInvariant()+",\"layered\":"+((style&0x80000)!=0).ToString().ToLowerInvariant()+",\"taskbarRegistered\":"+taskbarRegistered.ToString().ToLowerInvariant()+",\"animationFrames\":"+animationFrames+",\"width\":"+Width+",\"height\":"+Height+",\"y\":"+Top+"}");return;
                    }
                    if(message=="ready"||message=="ready:light"||message=="ready:dark")
                    {
                        BackColor=message=="ready:light"?Color.FromArgb(247,248,250):Color.FromArgb(16,19,22);
                        browser.DefaultBackgroundColor=BackColor;
                        ready=true;loadTimeout.Stop();loading.Visible=false;browser.Visible=true;
                        StartupTiming.Ready();
                        if(!managerPrewarmed){managerPrewarmed=true;managerWarmup.Start();}
                        int preference=2;try{DwmSetWindowAttribute(Handle,33,ref preference,4);}catch{}
                        if(pendingInstallPin){pendingInstallPin=false;PinLauncher(IntPtr.Zero);}else if(openRequested) Reveal();else Hide();DebugState();return;
                    }
                    if (message == "dismiss") Dismiss();
                    else if (message == "manage")
                    {
                        Process.Start(new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(root, "Start-ProfileDock.ps1") + "\"") { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden });
                        Dismiss();
                    }
                }
                catch (Exception error) { Log(error); }
            };
            browser.CoreWebView2.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs args)
            {
                if (!args.IsSuccess) { ShowError(new InvalidOperationException("The pinned menu could not load: " + args.WebErrorStatus)); return; }
                browser.Visible=true;
            };
            browser.CoreWebView2.Navigate("http://127.0.0.1:1420/?launcher=1");
        }
        catch (Exception error) { ShowError(error); }
        finally { initializing = false; }
    }
    private async Task<object> CopyFolderPath(Dictionary<string,object> arguments)
    {
        string path=new FolderFavorites(Path.Combine(data,"favorite-folders.json")).PathFor((string)arguments["id"]);
        for(int attempt=0;;attempt++)
        {
            try{Clipboard.SetText(path,TextDataFormat.UnicodeText);return new {copied=true};}
            catch(ExternalException){if(attempt>=4)throw new InvalidOperationException("Clipboard is busy. Please try copying again.");}
            await Task.Delay(40);
        }
    }
    private async Task<object> HandleFolderRequest(string type,Dictionary<string,object> arguments)
    {
        var favorites=new FolderFavorites(Path.Combine(data,"favorite-folders.json"));
        if(type=="folder-add")
        {
            nativeDialog=true;
            try{
                using(var picker=new FolderBrowserDialog {Description="Choose a favourite folder for Automora Dock",ShowNewFolderButton=false})
                    return picker.ShowDialog(this)==DialogResult.OK?await FolderCommand("folder-add",new Dictionary<string,object>{{"path",picker.SelectedPath}}):await FolderCommand("folder-list",new Dictionary<string,object>());
            }finally{nativeDialog=false;if(Visible){Activate();browser.Focus();}}
        }
        if(type=="folder-open")
        {
            string path=favorites.Resolve((string)arguments["id"]);
            Process.Start(new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"explorer.exe"),QuoteArgument(path)){UseShellExecute=true});
            Dismiss();return new {requested=true};
        }
        return await FolderCommand(type,arguments);
    }
    private async Task<object> FolderCommand(string action,Dictionary<string,object> arguments)
    {
        var json=new JavaScriptSerializer();arguments["action"]=action;
        using(var client=new HttpClient(new HttpClientHandler{UseProxy=false})){
            client.Timeout=TimeSpan.FromSeconds(20);
            var session=json.Deserialize<Dictionary<string,object>>(await client.GetStringAsync("http://127.0.0.1:1420/api/session"));
            client.DefaultRequestHeaders.Add("Origin","http://127.0.0.1:1420");client.DefaultRequestHeaders.Add("X-ProfileDock-Token",(string)session["token"]);
            using(var content=new StringContent(json.Serialize(new{command="favorite_folder",args=arguments}),Encoding.UTF8,"application/json"))
            using(var response=await client.PostAsync("http://127.0.0.1:1420/api/command",content)){
                var payload=json.Deserialize<Dictionary<string,object>>(await response.Content.ReadAsStringAsync());
                if(!response.IsSuccessStatusCode)throw new InvalidOperationException(payload.ContainsKey("error")?(string)payload["error"]:"Folder action failed.");
                return payload["result"];
            }
        }
    }
    private static string QuoteArgument(string argument)
    {
        var text=new StringBuilder("\"");int slashes=0;
        foreach(char character in argument)
        {
            if(character=='\\'){slashes++;continue;}
            text.Append('\\',character=='"'?slashes*2+1:slashes);text.Append(character);slashes=0;
        }
        text.Append('\\',slashes*2);return text.Append('"').ToString();
    }
    private bool IsChromeWindow(IntPtr window,string executable)
    {
        if(window==IntPtr.Zero || !IsWindowVisible(window))return false;
        var name=new StringBuilder(256);GetClassName(window,name,256);
        if(name.ToString()!="Chrome_WidgetWin_1")return false;
        try{int pid;GetWindowThreadProcessId(window,out pid);using(var process=Process.GetProcessById(pid))return string.Equals(process.MainModule.FileName,executable,StringComparison.OrdinalIgnoreCase);}catch{return false;}
    }
    private async Task LaunchChrome(Dictionary<string,object> arguments)
    {
        // The trusted service resolves the profile and validates paths and URL.
        var json=new JavaScriptSerializer();Dictionary<string,object> spec;
        bool forceMaximized=arguments.ContainsKey("forceMaximized") && arguments["forceMaximized"] is bool && (bool)arguments["forceMaximized"];
        using(var client=new HttpClient(new HttpClientHandler{UseProxy=false}))
        {
            client.Timeout=TimeSpan.FromSeconds(10);
            var session=json.Deserialize<Dictionary<string,object>>(await client.GetStringAsync("http://127.0.0.1:1420/api/session"));
            client.DefaultRequestHeaders.Add("Origin","http://127.0.0.1:1420");
            client.DefaultRequestHeaders.Add("X-ProfileDock-Token",(string)session["token"]);
            using(var content=new StringContent(json.Serialize(new {command="prepare_launch",args=arguments}),Encoding.UTF8,"application/json"))
            using(var response=await client.PostAsync("http://127.0.0.1:1420/api/command",content))
            {
                var result=json.Deserialize<Dictionary<string,object>>(await response.Content.ReadAsStringAsync());
                if(!response.IsSuccessStatusCode)throw new InvalidOperationException((string)result["error"]);
                spec=(Dictionary<string,object>)result["result"];
            }
        }
        string executable=(string)spec["executable"];
        var before=new HashSet<IntPtr>();EnumWindows((window,unused)=>{if(IsChromeWindow(window,executable)){before.Add(window);int pid;GetWindowThreadProcessId(window,out pid);AllowSetForegroundWindow(pid);}return true;},IntPtr.Zero);
        var quoted=new List<string>();foreach(object argument in (System.Collections.IEnumerable)spec["args"])quoted.Add(QuoteArgument((string)argument));
        // Starting from the user-activated native window gives Chrome foreground
        // permission; the background Node service does not own that permission.
        using(var process=Process.Start(new ProcessStartInfo(executable,string.Join(" ",quoted)){UseShellExecute=false})){}
        for(int attempt=0;attempt<60;attempt++)
        {
            await Task.Delay(100);
            IntPtr target=IntPtr.Zero;
            EnumWindows((window,unused)=>{if(!before.Contains(window)&&IsChromeWindow(window,executable)){target=window;return false;}return true;},IntPtr.Zero);
            if(target==IntPtr.Zero){var foreground=GetForegroundWindow();if(IsChromeWindow(foreground,executable))target=foreground;}
            if(target!=IntPtr.Zero)
            {
                if(forceMaximized)ShowWindowAsync(target,3);
                SetForegroundWindow(target);Dismiss();
                await Task.Delay(120);
                if(!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PROFILEDOCK_DEBUG_PORT")))
                    File.WriteAllText(Path.Combine(data,"logs","chrome-launch-debug.json"),json.Serialize(new {foreground=GetForegroundWindow()==target,maximized=IsZoomed(target),newWindow=!before.Contains(target)}));
                return;
            }
        }
        Dismiss();
    }
    private void ShowError(Exception error)
    {
        Log(error); ready=false;loadTimeout.Stop();
        if (browser != null) { browser.Dispose(); browser = null; }
        loading.Visible = true; loading.BringToFront();
        loading.Text = "Automora Dock could not open.\n\n" + error.Message + "\n\nClick here to retry. Your saved library is kept on this device.";
        loading.Padding = new Padding(28);
        if(openRequested){PositionPopup();Show();SetCloak(false);Activate();}
    }
    private void Log(Exception error)
    {
        try { string directory = Path.Combine(data, "logs"); Directory.CreateDirectory(directory); File.AppendAllText(Path.Combine(directory, "launcher.log"), DateTime.UtcNow.ToString("O") + " " + error + Environment.NewLine); } catch { }
    }
    private void DebugState()
    {
        if(string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PROFILEDOCK_DEBUG_PORT")))return;
        try{Directory.CreateDirectory(Path.Combine(data,"logs"));File.WriteAllText(Path.Combine(data,"logs","launcher-debug.json"),"{\"visible\":"+Visible.ToString().ToLowerInvariant()+",\"ready\":"+ready.ToString().ToLowerInvariant()+",\"state\":\""+WindowState+"\"}");}catch{}
    }
    private void DebugTrace(string action)
    {
        if(string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PROFILEDOCK_DEBUG_PORT")))return;
        try{Directory.CreateDirectory(Path.Combine(data,"logs"));File.AppendAllText(Path.Combine(data,"logs","launcher-toggle.log"),DateTime.UtcNow.ToString("O")+" "+action+" visible="+Visible+" closing="+closing+" suppressed="+ClosingGesture+Environment.NewLine);}catch{}
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { motion.Dispose(); managerWarmup.Dispose();loadTimeout.Dispose(); if (browser != null) browser.Dispose(); }
        base.Dispose(disposing);
    }
}
