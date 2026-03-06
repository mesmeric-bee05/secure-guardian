import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Heart, Shield } from 'lucide-react';
import { loginSchema, signupSchema } from '@/lib/validations';
import { getCsrfToken, validateCsrfToken } from '@/lib/csrf';

const ALLOWED_REDIRECTS = ['/', '/dashboard', '/chat', '/emergency', '/profile', '/reports', '/admin', '/onboarding'];

function isValidRedirect(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  const basePath = path.split('?')[0].split('#')[0];
  return ALLOWED_REDIRECTS.includes(basePath);
}

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [csrfToken] = useState(() => getCsrfToken());
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!validateCsrfToken(csrfToken)) {
      toast({ title: 'Error', description: 'Security validation failed. Please refresh.', variant: 'destructive' });
      return;
    }
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      toast({ title: 'Error', description: result.error.errors[0].message, variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    const { data, error } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      toast({ title: 'Login Failed', description: error.message, variant: 'destructive' });
    } else {
      // Check if onboarding is completed
      if (data?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('user_id', data.user.id)
          .single();
        
        if (profile && !profile.onboarding_completed) {
          navigate('/onboarding');
          return;
        }
      }
      const intended = (window.history.state?.from as string) || '/';
      navigate(isValidRedirect(intended) ? intended : '/');
    }
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      fullName: formData.get('fullName') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      confirmPassword: formData.get('confirmPassword') as string,
    };

    if (!validateCsrfToken(csrfToken)) {
      toast({ title: 'Error', description: 'Security validation failed. Please refresh.', variant: 'destructive' });
      return;
    }

    const result = signupSchema.safeParse(data);
    if (!result.success) {
      toast({ title: 'Error', description: result.error.errors[0].message, variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(data.email, data.password, data.fullName);
    setIsLoading(false);

    if (error) {
      toast({ title: 'Signup Failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Account Created', description: 'Welcome to MediReach+!' });
      navigate('/onboarding');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center">
              <Heart className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">MediReach+</CardTitle>
          <CardDescription>Your AI-powered health companion</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Log In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input id="login-password" name="password" type="password" required />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Logging in...' : 'Log In'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input id="signup-name" name="fullName" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input id="signup-password" name="password" type="password" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirm Password</Label>
                  <Input id="signup-confirm" name="confirmPassword" type="password" required />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Your data is secure and encrypted</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
