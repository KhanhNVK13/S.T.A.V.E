$paths = @(
    "C:\Users\DUCK-KANCHOU\Project_STAVE\S.T.A.V.E\docs\Report5_Test Report.xlsx",
    "C:\Users\DUCK-KANCHOU\OneDrive\文档\STAVE\Report5_Test Report.xlsx"
)

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    foreach ($path in $paths) {
        Write-Output "Opening and recalculating: $path ..."
        $wb = $excel.Workbooks.Open($path)
        $excel.CalculateFull()
        $wb.Save()
        $wb.Close()
        Write-Output "Completed: $path"
    }
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
