"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast"; // Re-introduced useToast
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import Image from "next/image";

const LoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const { toast } = useToast(); // Initialize useToast
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Background Canvas Animation Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let angle = 0;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    function drawMotor() {
       if (!ctx) return; // Check context validity again
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Outer Stator (fixed)
      ctx.beginPath();
      ctx.strokeStyle = "#3498db"; // light blue
      ctx.lineWidth = 15;
      ctx.arc(centerX, centerY, 120, 0, Math.PI * 2);
      ctx.stroke();

      // Inner Rotor (rotating)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);
      for (let i = 0; i < 6; i++) {
        ctx.rotate((Math.PI * 2) / 6);
        ctx.beginPath();
        ctx.fillStyle = "#2ecc71"; // green rotor arms
        ctx.fillRect(50, -5, 40, 10); // arm
      }
      ctx.restore();

      // Shaft
      ctx.beginPath();
      ctx.fillStyle = "#f1c40f"; // yellow shaft
      ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
      ctx.fill();

      // Rotation effect
      angle += 0.02;
      requestAnimationFrame(drawMotor);
    }

     const animationFrameId = requestAnimationFrame(drawMotor);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId); // Cleanup animation frame
    };
  }, []); // Empty dependency array ensures this runs once on mount

  // Login Form Submission Logic
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(""); // Reset error message

    // Extended conditional logic for login
    if (
      (username === "ADMIN" && password === "admin01") ||
      (username === "Karishma" && password === "kdevi") ||
      (username === "Renuka" && password === "renu")
    ) {
      toast({ // Use toast for success
        title: "Success",
        description: "Login successful!",
      });
      router.push("/dashboard");
    } else {
       setError("Invalid username or password. Please try again."); // Set error message
       toast({ // Use toast for error
         title: "Error",
         description: "Invalid username or password. Please try again.",
         variant: "destructive",
       });
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen overflow-hidden">
      {/* Canvas motor animation background */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full -z-10"
        aria-hidden="true" // Hide canvas from screen readers
      />

      {/* Semi-transparent black overlay */}
      <div className="absolute inset-0 w-full h-full bg-black/50 -z-9" />

      {/* Login Card */}
       <Card className="w-full max-w-md bg-transparent backdrop-blur-md shadow-xl rounded-xl border border-accent/40 z-10">
        <CardHeader className="space-y-1 relative text-center p-6">
           {/* Logo placeholder removed */}
           <CardTitle className="text-xl sm:text-2xl font-semibold text-white">
             Lal&apos;s Motor Winders (FIJI) PTE Limited
           </CardTitle>
         </CardHeader>
        <CardContent className="p-6 pt-0">
          {error && (
            <div className="mb-4 text-center text-red-400 bg-red-900/30 border border-red-500/50 p-2 rounded-md text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username" className="text-gray-300 font-medium">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="bg-white/10 text-white placeholder-gray-400 border-white/20 focus:ring-offset-0 focus:ring-primary/50"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password" className="text-gray-300 font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white/10 text-white placeholder-gray-400 border-white/20 focus:ring-offset-0 focus:ring-primary/50"
              />
            </div>
            <Button className="w-full mt-6" type="submit" variant="gradient" size="lg">
              Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
