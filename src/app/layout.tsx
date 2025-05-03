import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google'; // Use Geist_Mono for monospace
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Lal\'s Motor Winders (FIJI) PTE Limited',
  description: 'Payroll Management Application', // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Apply background via ::before in globals.css */}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}>
        {/* Changed main to div to avoid nested main tags potentially */}
        <div className="flex flex-col flex-grow">
          {children}
        </div>
        <Toaster />
        {/* Footer remains outside the main scrolling area */}
        <footer className="w-full text-center py-4 text-xs text-white relative z-10 bg-black/30 backdrop-blur-sm">
          © {new Date().getFullYear()} Aayush Atishay Lal 北京化工大学
        </footer>
      </body>
    </html>
  );
}