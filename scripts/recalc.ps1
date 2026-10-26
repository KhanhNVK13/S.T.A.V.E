$excelPath = "C:\Users\DUCK-KANCHOU\Project_STAVE\S.T.A.V.E\docs\Report5_Unit Test.xlsx"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Open($excelPath)
    $excel.CalculateFull()
    $wb.Save()
    $wb.Close()
    Write-Output "Excel full calculation and save completed successfully."
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
