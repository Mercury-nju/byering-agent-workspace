# refresh_sort.ps1
# 刷新指定目录的资源管理器窗口，并按名称升序排列
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File refresh_sort.ps1 -TargetPath "D:/知识库/06-通用工具类"

param(
    [Parameter(Mandatory=$true)]
    [string]$TargetPath
)

# 将路径中的正斜杠统一转换为反斜杠，以匹配 Windows 资源管理器返回的路径格式
$normalizedTarget = $TargetPath.Replace('/', '\')

# 去除末尾的反斜杠（如果有），保持路径格式一致
$normalizedTarget = $normalizedTarget.TrimEnd('\')

$refreshed = $false

# ===== 第一步：刷新匹配的资源管理器窗口并设置排序 =====
$shell = New-Object -ComObject Shell.Application
$windows = $shell.Windows()

foreach ($w in $windows) {
    try {
        $loc = $w.Document.Folder.Self.Path
        if ($loc -and ($loc.TrimEnd('\') -eq $normalizedTarget)) {
            # 设置按名称升序排列
            $w.Document.SortColumns = 'prop:System.ItemNameDisplay;'
            # 刷新视图内容
            $w.Refresh()
            $refreshed = $true
            Write-Host "[OK] 已刷新并排序: $loc"
        }
    } catch {
        # 忽略非文件夹窗口（如控制面板等）的异常
    }
}

if (-not $refreshed) {
    Write-Host "[INFO] 未找到已打开的目标目录窗口: $normalizedTarget"
}

# ===== 第二步：桌面特殊处理 =====
# 桌面不是标准的资源管理器窗口，Shell.Application.Windows() 无法遍历到桌面视图
# 因此当目标路径是桌面时，通过 IFolderView2 COM 接口调用 SetSortColumns 实现按名称排序
# 原理：ShellWindows::FindWindowSW(SWC_DESKTOP) -> IServiceProvider -> IShellBrowser -> IShellView -> IFolderView2
$desktopPath = [Environment]::GetFolderPath('Desktop')
if ($normalizedTarget -eq $desktopPath) {
    $csCode = @'
using System;
using System.Runtime.InteropServices;

public class DesktopSortHelper {
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct PROPERTYKEY {
        public Guid fmtid;
        public uint pid;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct SORTCOLUMN {
        public PROPERTYKEY propkey;
        public int direction;
    }

    // System.ItemNameDisplay = {B725F130-47EF-101A-A5F1-02608C9EEBAC}, 10
    public static readonly PROPERTYKEY PKEY_ItemNameDisplay = new PROPERTYKEY {
        fmtid = new Guid("B725F130-47EF-101A-A5F1-02608C9EEBAC"),
        pid = 10
    };

    static readonly Guid SID_STopLevelBrowser = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837");
    static readonly Guid IID_IShellBrowser = new Guid("000214E2-0000-0000-C000-000000000046");

    [ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IServiceProvider {
        [PreserveSig]
        int QueryService(ref Guid guidService, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppvObject);
    }

    [ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellBrowser {
        [PreserveSig] int GetWindow(out IntPtr phwnd);
        [PreserveSig] int ContextSensitiveHelp(bool fEnterMode);
        [PreserveSig] int InsertMenusSB(IntPtr hmenuShared, IntPtr lpMenuWidths);
        [PreserveSig] int SetMenuSB(IntPtr hmenuShared, IntPtr holemenuRes, IntPtr hwndActiveObject);
        [PreserveSig] int RemoveMenusSB(IntPtr hmenuShared);
        [PreserveSig] int SetStatusTextSB(IntPtr pszStatusText);
        [PreserveSig] int EnableModelessSB(bool fEnable);
        [PreserveSig] int TranslateAcceleratorSB(IntPtr pmsg, ushort wID);
        [PreserveSig] int BrowseObject(IntPtr pidl, uint wFlags);
        [PreserveSig] int GetViewStateStream(uint grfMode, out IntPtr ppStrm);
        [PreserveSig] int GetControlWindow(uint id, out IntPtr phwnd);
        [PreserveSig] int SendControlMsg(uint id, uint uMsg, IntPtr wParam, IntPtr lParam, out IntPtr pret);
        [PreserveSig] int QueryActiveShellView([MarshalAs(UnmanagedType.IUnknown)] out object ppshv);
        [PreserveSig] int OnViewWindowActive(IntPtr pshv);
        [PreserveSig] int SetToolbarItems(IntPtr lpButtons, uint nButtons, uint uFlags);
    }

    [ComImport, Guid("1AF3A467-214F-4298-908E-06B03E0B39F9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFolderView2 {
        // IFolderView methods (14)
        [PreserveSig] int GetCurrentViewMode(out uint pViewMode);
        [PreserveSig] int SetCurrentViewMode(uint ViewMode);
        [PreserveSig] int GetFolder(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        [PreserveSig] int Item(int iItemIndex, out IntPtr ppidl);
        [PreserveSig] int ItemCount(uint uFlags, out int pcItems);
        [PreserveSig] int Items(uint uFlags, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        [PreserveSig] int GetSelectionMarkedItem(out int piItem);
        [PreserveSig] int GetFocusedItem(out int piItem);
        [PreserveSig] int GetItemPosition(IntPtr pidl, out long ppt);
        [PreserveSig] int GetSpacing(out long ppt);
        [PreserveSig] int GetDefaultSpacing(out long ppt);
        [PreserveSig] int GetAutoArrange();
        [PreserveSig] int SelectItem(int iItem, uint dwFlags);
        [PreserveSig] int SelectAndPositionItems(uint cidl, IntPtr apidl, IntPtr apt, uint dwFlags);
        // IFolderView2 methods
        [PreserveSig] int SetGroupBy(ref PROPERTYKEY key, bool fAscending);
        [PreserveSig] int GetGroupBy(out PROPERTYKEY pkey, out bool pfAscending);
        [PreserveSig] int SetViewProperty(IntPtr pidl, ref PROPERTYKEY propkey, IntPtr propvar);
        [PreserveSig] int GetViewProperty(IntPtr pidl, ref PROPERTYKEY propkey, out IntPtr ppropvar);
        [PreserveSig] int SetTileViewProperties(IntPtr pidl, [MarshalAs(UnmanagedType.LPWStr)] string pszPropList);
        [PreserveSig] int SetExtendedTileViewProperties(IntPtr pidl, [MarshalAs(UnmanagedType.LPWStr)] string pszPropList);
        [PreserveSig] int SetText(int iType, [MarshalAs(UnmanagedType.LPWStr)] string pwszText);
        [PreserveSig] int SetCurrentFolderFlags(uint dwMask, uint dwFlags);
        [PreserveSig] int GetCurrentFolderFlags(out uint pdwFlags);
        [PreserveSig] int GetSortColumnCount(out int pcColumns);
        [PreserveSig] int SetSortColumns([MarshalAs(UnmanagedType.LPArray)] SORTCOLUMN[] rgSortColumns, int cColumns);
        [PreserveSig] int GetSortColumns([MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 1)] SORTCOLUMN[] rgSortColumns, int cColumns);
    }

    public static string SortDesktopByName() {
        try {
            Type swType = Type.GetTypeFromCLSID(new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39"));
            if (swType == null) return "ERROR: Cannot get ShellWindows type";
            object shellWindows = Activator.CreateInstance(swType);
            if (shellWindows == null) return "ERROR: Cannot create ShellWindows";

            // FindWindowSW: SWC_DESKTOP=8, SWFO_NEEDDISPATCH=1
            object[] findArgs = new object[] { 0, 0, 8, 0, 1 };
            object pDisp;
            try {
                pDisp = swType.InvokeMember("FindWindowSW",
                    System.Reflection.BindingFlags.InvokeMethod, null, shellWindows, findArgs);
            } catch (Exception ex) {
                return "ERROR: FindWindowSW: " + ex.Message;
            }
            if (pDisp == null) return "ERROR: FindWindowSW returned null";

            IServiceProvider sp = (IServiceProvider)pDisp;
            Guid sidBrowser = SID_STopLevelBrowser;
            Guid iidBrowser = IID_IShellBrowser;
            object browserObj;
            int hr = sp.QueryService(ref sidBrowser, ref iidBrowser, out browserObj);
            if (hr != 0) return "ERROR: QueryService IShellBrowser: 0x" + hr.ToString("X8");

            IShellBrowser browser = (IShellBrowser)browserObj;
            object viewObj;
            hr = browser.QueryActiveShellView(out viewObj);
            if (hr != 0) return "ERROR: QueryActiveShellView: 0x" + hr.ToString("X8");

            IFolderView2 fv2 = (IFolderView2)viewObj;

            SORTCOLUMN[] sc = new SORTCOLUMN[1];
            sc[0] = new SORTCOLUMN();
            sc[0].propkey = PKEY_ItemNameDisplay;
            sc[0].direction = 1; // ascending
            hr = fv2.SetSortColumns(sc, 1);
            if (hr != 0) return "ERROR: SetSortColumns: 0x" + hr.ToString("X8");

            return "OK";
        } catch (Exception ex) {
            return "ERROR: " + ex.GetType().Name + ": " + ex.Message;
        }
    }
}
'@

    $csFile = [System.IO.Path]::GetTempFileName() + ".cs"
    [System.IO.File]::WriteAllText($csFile, $csCode, [System.Text.Encoding]::UTF8)
    try {
        Add-Type -Path $csFile
        $sortResult = [DesktopSortHelper]::SortDesktopByName()
        if ($sortResult -eq "OK") {
            Write-Host "[OK] Desktop icons sorted by name (IFolderView2)"
        } else {
            Write-Host "[WARN] Desktop sort failed: $sortResult"
        }
    } finally {
        Remove-Item $csFile -ErrorAction SilentlyContinue
    }
}
