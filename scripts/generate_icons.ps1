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

            using (SolidBrush bgBrush = new SolidBrush(Color.FromArgb(255, 11, 15, 25)))
            {
                g.FillRectangle(bgBrush, 0, 0, size, size);
            }

            float scale = size / 512f;
            float margin = isMaskable ? (70f * scale) : (32f * scale);
            float innerSize = size - (margin * 2f);

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

            Color amber = Color.FromArgb(255, 245, 158, 11);
            Color white = Color.FromArgb(255, 248, 250, 252);
            Color dark = Color.FromArgb(255, 15, 23, 42);

            using (SolidBrush amberBrush = new SolidBrush(amber))
            {
                g.FillRectangle(amberBrush, 185f * scale, 160f * scale, 110f * scale, 170f * scale);
            }

            using (SolidBrush darkBrush = new SolidBrush(dark))
            {
                g.FillRectangle(darkBrush, 205f * scale, 185f * scale, 70f * scale, 45f * scale);
            }

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

    public static void GenerateScreenshot(int w, int h, string outFile)
    {
        using (Bitmap bmp = new Bitmap(w, h))
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;

            // Background
            using (SolidBrush bg = new SolidBrush(Color.FromArgb(255, 11, 15, 25)))
            {
                g.FillRectangle(bg, 0, 0, w, h);
            }

            // Top Header Bar
            using (SolidBrush header = new SolidBrush(Color.FromArgb(255, 18, 24, 38)))
            {
                g.FillRectangle(header, 0, 0, w, 64);
            }

            // Amber Title
            using (Font font = new Font("Arial", 18f, FontStyle.Bold, GraphicsUnit.Pixel))
            using (SolidBrush amber = new SolidBrush(Color.FromArgb(255, 245, 158, 11)))
            using (SolidBrush white = new SolidBrush(Color.FromArgb(255, 248, 250, 252)))
            using (SolidBrush muted = new SolidBrush(Color.FromArgb(255, 148, 163, 184)))
            {
                g.DrawString("TTD FUEL TRACKING", font, amber, 24, 20);

                // Asset Card
                int cardY = 80;
                using (SolidBrush cardBg = new SolidBrush(Color.FromArgb(255, 22, 31, 48)))
                using (Pen border = new Pen(Color.FromArgb(255, 45, 60, 85), 2f))
                {
                    g.FillRectangle(cardBg, 20, cardY, w - 40, 220);
                    g.DrawRectangle(border, 20, cardY, w - 40, 220);
                }

                using (Font idFont = new Font("Arial", 22f, FontStyle.Bold, GraphicsUnit.Pixel))
                using (Font textFont = new Font("Arial", 14f, FontStyle.Regular, GraphicsUnit.Pixel))
                {
                    g.DrawString("TTD-MAT-0001", idFont, white, 36, cardY + 20);
                    g.DrawString("GENERATOR • 100 kVA • North Zone", textFont, amber, 36, cardY + 54);
                    g.DrawString("Stage Alpha Power Compound (///puzzle.stages.daring)", textFont, muted, 36, cardY + 80);
                    g.DrawString("Status: POWERED UP • Fuel: 85% • DEF: 90%", textFont, white, 36, cardY + 110);
                }

                // Buttons
                int btnY = cardY + 150;
                int btnW = (w - 70) / 2;
                using (SolidBrush btnGreen = new SolidBrush(Color.FromArgb(255, 34, 197, 94)))
                using (SolidBrush btnBlue = new SolidBrush(Color.FromArgb(255, 59, 130, 246)))
                using (Font btnFont = new Font("Arial", 13f, FontStyle.Bold, GraphicsUnit.Pixel))
                using (StringFormat sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                {
                    g.FillRectangle(btnGreen, 36, btnY, btnW, 44);
                    g.DrawString("CHECK IN", btnFont, white, new RectangleF(36, btnY, btnW, 44), sf);

                    g.FillRectangle(btnBlue, 36 + btnW + 10, btnY, btnW, 44);
                    g.DrawString("FUEL TRANSFER", btnFont, white, new RectangleF(36 + btnW + 10, btnY, btnW, 44), sf);
                }
            }

            bmp.Save(outFile, ImageFormat.Png);
            Console.WriteLine("Built: " + outFile + " (" + w + "x" + h + ")");
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

[IconBuilder]::GenerateScreenshot(540, 960, "public/screenshot-mobile.png")
[IconBuilder]::GenerateScreenshot(1280, 720, "public/screenshot-desktop.png")
