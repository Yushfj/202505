
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import { Loader2 } from "lucide-react";

const LoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    const validUsers: { [key: string]: string } = {
      ADMIN: "admin01",
      Karishma: "kdevi",
      Renuka: "renu",
      "Priyanka Sharma": "psharma",
    };

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (validUsers[trimmedUsername] === trimmedPassword) {
      toast({
        title: "Success",
        description: "Login successful!",
      });
      localStorage.setItem('username', trimmedUsername); // Store trimmed username
      
      // Updated redirect logic for Priyanka Sharma
      router.push("/dashboard"); 

    } else {
      setError("Invalid username or password. Please try again.");
      toast({
        title: "Error",
        description: "Invalid username or password. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md bg-transparent backdrop-blur-md shadow-xl rounded-xl border border-accent/40 z-10">
        <CardHeader className="space-y-1 relative text-center p-6">
          <div className="flex justify-center mb-4">
            <Image src="/logo.png" alt="Company Logo" width={80} height={80} className="rounded-full" />
          </div>
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
                disabled={isLoading}
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
                disabled={isLoading}
              />
            </div>
            <Button
              className="w-full mt-6"
              type="submit"
              variant="gradient"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
