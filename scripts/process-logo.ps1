# Process master logo and extension icons
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonScript = Join-Path $PSScriptRoot "process_logo.py"

if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "Running Python asset processor: $pythonScript"
    python $pythonScript
} else {
    Add-Type -AssemblyName System.Drawing
    $srcPath = Join-Path $projectRoot "src\assets\logo-source.jpg"
    $destDir = Join-Path $projectRoot "src\assets\icons"

    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    $img = [System.Drawing.Image]::FromFile($srcPath)
    $cropX = 274
    $cropY = 40
    $cropW = 480
    $cropH = 480

    $cropRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
    $croppedBmp = New-Object System.Drawing.Bitmap($cropW, $cropH)
    $cropG = [System.Drawing.Graphics]::FromImage($croppedBmp)
    $cropG.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $cropG.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $cropG.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $cropG.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
    $cropG.Dispose()

    $masterPath = Join-Path $projectRoot "src\assets\logo.png"
    $croppedBmp.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $sizes = @(128, 48, 32, 16)
    foreach ($s in $sizes) {
        $resized = New-Object System.Drawing.Bitmap($s, $s)
        $g = [System.Drawing.Graphics]::FromImage($resized)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($croppedBmp, (New-Object System.Drawing.Rectangle(0, 0, $s, $s)))
        $g.Dispose()

        $outPath = Join-Path $destDir "$s.png"
        $resized.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $resized.Dispose()
    }
    $croppedBmp.Dispose()
    $img.Dispose()
    Write-Host "Processed icons via GDI+"
}
