"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Eye, EyeOff } from "lucide-react";

const ACCESS_PHRASE = 'IWantStatsNow26';
const STORAGE_KEY = 'threat-dashboard-access';

interface AccessModalProps {
  children: React.ReactNode;
}

export default function AccessModal({ children }: AccessModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState('');
  const [showPhrase, setShowPhrase] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const hasAccess = localStorage.getItem(STORAGE_KEY) === 'granted';
    setIsAuthenticated(hasAccess);
    setIsOpen(!hasAccess);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (phrase === ACCESS_PHRASE) {
      localStorage.setItem(STORAGE_KEY, 'granted');
      setIsAuthenticated(true);
      setIsOpen(false);
      setError('');
    } else {
      setError('Incorrect phrase. Please try again.');
      setPhrase('');
    }
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader className="text-center">
            <div className="mx-auto p-3 rounded-full bg-primary/10 text-primary w-fit mb-4">
              <Shield className="h-8 w-8" />
            </div>
            <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/70">
              Access Required
            </DialogTitle>
            <p className="text-muted-foreground mt-2">
              Enter the access phrase to view the dashboard
            </p>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                type={showPhrase ? "text" : "password"}
                placeholder="Enter access phrase"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                className="pr-10"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPhrase(!showPhrase)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPhrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <Button
              type="submit"
              className="w-full"
              disabled={!phrase.trim()}
            >
              Access Dashboard
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Render children with blur when not authenticated */}
      <div className={isAuthenticated ? '' : 'blur-sm pointer-events-none select-none'}>
        {children}
      </div>
    </>
  );
}