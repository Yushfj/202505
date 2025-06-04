
"use client"; // Required for useEffect and useRef

import type {Metadata} from 'next'; // Keep type import for reference if needed elsewhere
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import React, { useEffect, useRef } from 'react'; // Import React and hooks

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Metadata cannot be exported from a Client Component.
// If you need to set metadata, do it in a Server Component,
// typically a page.tsx or a parent layout.tsx that is a Server Component.
// export const metadata: Metadata = {
// title: 'Lal\'s Motor Winders (FIJI) PTE Limited',
// description: 'Payroll Management Application',
// };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const globalWallpaperContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = globalWallpaperContainerRef.current;
    if (!container) return;

    // Create dynamic particles
    function createParticle() {
      if (!container) return;
      const particle = document.createElement('div');
      particle.className = 'particle-dynamic-global-wp'; // Use a distinct class name
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 5 + 's';
      particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
      particle.style.setProperty('--particle-tx-global-wp', (Math.random() * 200 - 100) + 'px');
      container.appendChild(particle);

      setTimeout(() => {
        if (particle.parentNode) {
          particle.parentNode.removeChild(particle);
        }
      }, 20000); // Lifespan of particle
    }

    const particleInterval = setInterval(createParticle, 1500); // Create particles faster

    // Add random electrical sparks
    function createRandomSpark() {
      if (!container) return;
      const spark = document.createElement('div');
      spark.className = 'spark-dynamic-global-wp'; // Use a distinct class name
      spark.style.left = Math.random() * 100 + '%';
      spark.style.top = Math.random() * 100 + '%';
      spark.style.animationDuration = (Math.random() * 1.5 + 0.5) + 's'; // Sparks faster
      container.appendChild(spark);

      setTimeout(() => {
        if (spark.parentNode) {
          spark.parentNode.removeChild(spark);
        }
      }, 2000); // Lifespan of spark
    }

    const sparkInterval = setInterval(createRandomSpark, 2500); // Create sparks more frequently

    return () => {
      clearInterval(particleInterval);
      clearInterval(sparkInterval);
      // Clean up dynamically added particles and sparks
      if (container) {
        const dynamicElements = container.querySelectorAll('.particle-dynamic-global-wp, .spark-dynamic-global-wp');
        dynamicElements.forEach(el => el.remove());
      }
    };
  }, []);

  return (
    <html lang="en">
      {/* body styles are now directly in globals.css for global wallpaper */}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        
        {/* Global Wallpaper Container */}
        <div ref={globalWallpaperContainerRef} className="global-wallpaper-container-fx">
          <div className="circuit-bg-global-wp"></div>
          <div className="energy-wave-global-wp" style={{ animationDelay: '0s' }}></div>
          <div className="energy-wave-global-wp" style={{ animationDelay: '1s' }}></div>
          <div className="energy-wave-global-wp" style={{ animationDelay: '2s' }}></div>
          
          <div className="lightning-global-wp" style={{ left: '10%', animationDelay: '0s' }}></div>
          <div className="lightning-global-wp" style={{ left: '30%', animationDelay: '1s' }}></div>
          <div className="lightning-global-wp" style={{ right: '20%', animationDelay: '2s' }}></div>
          <div className="lightning-global-wp" style={{ right: '5%', animationDelay: '3s' }}></div>

          <div className="electrical-element-global-wp" style={{ top: '20%', left: '15%', animationDelay: '0s' }}>⚡</div>
          <div className="electrical-element-global-wp" style={{ top: '30%', right: '10%', animationDelay: '1s' }}>🔌</div>
          <div className="electrical-element-global-wp" style={{ bottom: '25%', left: '10%', animationDelay: '2s' }}>⚙️</div>
          <div className="electrical-element-global-wp" style={{ bottom: '35%', right: '15%', animationDelay: '3s' }}>🔧</div>
          <div className="electrical-element-global-wp" style={{ top: '15%', right: '25%', animationDelay: '4s' }}>📡</div>
          <div className="electrical-element-global-wp" style={{ bottom: '20%', left: '25%', animationDelay: '5s' }}>🏭</div>
          
          <div className="spark-static-global-wp" style={{ top: '25%', left: '20%', animationDelay: '0.5s' }}></div>
          <div className="spark-static-global-wp" style={{ top: '40%', right: '25%', animationDelay: '1.5s' }}></div>
          <div className="spark-static-global-wp" style={{ bottom: '30%', left: '30%', animationDelay: '2.5s' }}></div>
          <div className="spark-static-global-wp" style={{ bottom: '45%', right: '20%', animationDelay: '3.5s' }}></div>
        </div>

        {/* Main Content Area - Ensure it's positioned above the wallpaper */}
        <div className="relative z-10 flex flex-col flex-grow min-h-screen">
          {children}
        </div>
        <Toaster />
        <footer 
          className="w-full text-center py-4 text-xs text-white relative z-[101] bg-black/30 backdrop-blur-sm footer-main-layout"
        >
          © {new Date().getFullYear()} Aayush Atishay Lal 北京化工大学
        </footer>

        {/* Scoped styles for global wallpaper elements */}
        <style jsx>{`
          .global-wallpaper-container-fx {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            perspective: 1200px;
            overflow: hidden;
            z-index: -1; /* Behind all page content */
          }
          .circuit-bg-global-wp {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0.1;
            background-image: 
                linear-gradient(90deg, #00ff88 1px, transparent 1px),
                linear-gradient(#00ff88 1px, transparent 1px);
            background-size: 50px 50px;
            animation: circuitMoveGlobalWP 20s linear infinite;
          }
          .spark-static-global-wp, .spark-dynamic-global-wp {
            position: absolute;
            width: 4px; height: 4px;
            background: #00ff88;
            border-radius: 50%;
            box-shadow: 0 0 10px #00ff88;
            animation-name: sparkleGlobalWP;
            animation-iteration-count: infinite;
          }
          .spark-dynamic-global-wp { /* Styles specifically for JS-added sparks if different */
             /* animation-duration will be set by JS */
          }
          .electrical-element-global-wp {
            position: absolute;
            color: #00ff88;
            font-size: 24px;
            opacity: 0.7;
            animation: floatGlobalWP 8s ease-in-out infinite;
          }
          .lightning-global-wp {
            position: absolute;
            width: 2px;
            height: 200px;
            background: linear-gradient(to bottom, transparent, #00ff88, transparent);
            animation: lightningGlobalWP 4s infinite;
            opacity: 0;
          }
          .particle-dynamic-global-wp { /* Ensure this class matches JS */
            position: absolute;
            width: 2px; height: 2px;
            background: #00ff88;
            border-radius: 50%;
            animation-name: particleMoveGlobalWP;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
             /* animation-delay and animation-duration set by JS */
          }
          .energy-wave-global-wp {
            position: absolute;
            top: 50%; left: 50%;
            width: 100px; height: 100px; /* Adjust size as needed */
            border: 2px solid rgba(0, 255, 136, 0.1);
            border-radius: 50%;
            animation: energyPulseGlobalWP 4s ease-out infinite;
            transform: translate(-50%, -50%);
          }
        `}</style>
      </body>
    </html>
  );
}
