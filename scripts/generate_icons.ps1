$source = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class IconBuilder
{
    public static void Generate(int size, string outFile, bool isMaskable)
    {
        using (Bitmap bmp = new Bitmap(size, size))
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;

            // Background
            using (SolidBrush bgBrush = new SolidBrush(Color.FromArgb(255, 11, 15, 25)))
            {
                g.FillRectangle(bgBrush, 0, 0, size, size);
            }

            float scale = size / 512f;
            float margin = isMaskable ? (70f * scale) : (32f * scale);
            float innerSize = size - (margin * 2f);

            // Rounded badge container
            float radius = 48f * scale;
            using (GraphicsPath path = new GraphicsPath())
            {
                float x = margin;
                float y = margin;
                float w = innerSize;
                float h = innerSize;
                path.AddArc(x, y, radius, radius, 180, 90);
                path.AddArc(x + w - radius, y, radius, radius, 270, 90);
                path.AddArc(x + w - radius, y + h - radius, radius, radius, 0, 90);
                path.AddArc(x, y + h - radius, radius, radius, 90, 90);
                path.CloseFigure();

                using (SolidBrush cardBrush = new SolidBrush(Color.FromArgb(255, 22, 31, 48)))
                {
                    g.FillPath(cardBrush, path);
                }

                using (Pen amberPen = new Pen(Color.FromArgb(255, 245, 158, 11), 8f * scale))
                {
                    g.DrawPath(amberPen, path);
                }
            }

            // Colors
            Color amber = Color.FromArgb(255, 245, 158, 11);
            Color white = Color.FromArgb(255, 248, 250, 252);
            Color dark = Color.FromArgb(255, 15, 23, 42);

            // Fuel pump body
            using (SolidBrush amberBrush = new SolidBrush(amber))
            {
                g.FillRectangle(amberBrush, 185f * scale, 160f * scale, 110f * scale, 170f * scale);
            }

            // Fuel pump screen
            using (SolidBrush darkBrush = new SolidBrush(dark))
            {
                g.FillRectangle(darkBrush, 205f * scale, 185f * scale, 70f * scale, 45f * scale);
            }

            // Hose & nozzle
            using (Pen hosePen = new Pen(amber, 12f * scale))
            {
                hosePen.StartCap = LineCap.Round;
                hosePen.EndCap = LineCap.Round;
                g.DrawBezier(
                    hosePen,
                    295f * scale, 260f * scale,
                    345f * scale, 260f * scale,
                    345f * scale, 210f * scale,
                    315f * scale, 180f * scale
                );
            }

            // Lightning Bolt
            PointF[] bolt = new PointF[]
            {
                new PointF(240f * scale + 5f * scale, 250f * scale - 5f * scale),
                new PointF(240f * scale - 12f * scale, 250f * scale + 20f * scale),
                new PointF(240f * scale - 1f * scale, 250f * scale + 20f * scale),
                new PointF(240f * scale - 7f * scale, 250f * scale + 45f * scale),
                new PointF(240f * scale + 16f * scale, 250f * scale + 12f * scale),
                new PointF(240f * scale + 3f * scale, 250f * scale + 12f * scale)
            };
            using (GraphicsPath boltPath = new GraphicsPath())
            using (SolidBrush whiteBrush = new SolidBrush(white))
            {
                boltPath.AddPolygon(bolt);
                g.FillPath(whiteBrush, boltPath);
            }

            // Text
            using (Font font = new Font("Arial", 32f * scale, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Font subFont = new Font("Arial", 15f * scale, FontStyle.Bold, GraphicsUnit.Pixel))
            using (StringFormat sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
            using (SolidBrush whiteBrush = new SolidBrush(white))
            using (SolidBrush amberBrush = new SolidBrush(amber))
            {
                RectangleF titleRect = new RectangleF(0, 355f * scale, size, 45f * scale);
                g.DrawString("TTD FUEL", font, whiteBrush, titleRect, sf);

                RectangleF subRect = new RectangleF(0, 400f * scale, size, 30f * scale);
                g.DrawString("FLEET TRACKER", subFont, amberBrush, subRect, sf);
            }

            bmp.Save(outFile, ImageFormat.Png);
            Console.WriteLine("Built: " + outFile + " (" + size + "x" + size + ")");
        }
    }
}
"@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing

[IconBuilder]::Generate(512, "public/pwa-512x512.png", $false)
[IconBuilder]::Generate(512, "public/maskable-icon-512x512.png", $true)
[IconBuilder]::Generate(192, "public/pwa-192x192.png", $false)
[IconBuilder]::Generate(180, "public/apple-touch-icon.png", $false)
[IconBuilder]::Generate(64, "public/favicon-64x64.png", $false)
