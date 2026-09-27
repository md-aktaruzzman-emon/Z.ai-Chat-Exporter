Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\Md Aktaruzzman Emon\.gemini\antigravity\brain\a4e1fac9-b5e9-41d8-88eb-ed7cb1e3dfdf\zai_chat_logo_1790509404981.jpg"
$destDir = "c:\Z.ai Chat Exporter\src\assets\icons"

if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$img = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "Source image size: $($img.Width)x$($img.Height)"

# Crop the central emblem region if needed, or use full square
# The squircle is centered, covering roughly 150 to 874 (724x724)
# Let's crop slightly into the squircle so the squircle fills the icon nicely
$cropX = [int]($img.Width * 0.12)
$cropY = [int]($img.Height * 0.12)
$cropW = [int]($img.Width * 0.76)
$cropH = [int]($img.Height * 0.76)

$cropRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
$croppedBmp = New-Object System.Drawing.Bitmap($cropW, $cropH)
$cropG = [System.Drawing.Graphics]::FromImage($croppedBmp)
$cropG.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$cropG.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$cropG.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$cropG.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$cropG.Dispose()

# Save master cropped logo
$masterPath = "c:\Z.ai Chat Exporter\src\assets\logo.png"
$croppedBmp.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved master logo to $masterPath"

# Generate 128, 48, 32, 16 sizes
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
    Write-Host "Generated icon $s x $s at $outPath"
}

$croppedBmp.Dispose()
$img.Dispose()
Write-Host "All icons processed successfully!"
