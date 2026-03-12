import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata = {
  title: "Bus Tracker",
  description: "MVP seguimiento de micros",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}