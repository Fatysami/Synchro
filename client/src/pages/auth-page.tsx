import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { insertUserSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export default function AuthPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) {
      console.log('Utilisateur déjà connecté, redirection vers /', user);
      setLocation("/");
    }
  }, [user, setLocation]);

  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F3F5F6] flex items-center justify-center">
      <div className="w-[360px] h-[420px] bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col items-center gap-4 pt-8 pb-6">
          <div className="w-[56px] h-[56px]">
            <img 
              src="/nuxilog-logo.svg" 
              alt="Logo"
              width={56}
              height={56}
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-[24px] font-bold text-[#36599E] font-[-apple-system,system-ui,Arial,sans-serif]">
            Synchro NuxiDev
          </h1>
          <p className="text-[16px] text-[#212529] font-[-apple-system,system-ui,Arial,sans-serif]">
            Veuillez entrer vos identifiants de connexion
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

function LoginForm() {
  const { loginMutation } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertUserSchema.pick({ username: true, password: true })),
    defaultValues: {
      username: '',
      password: ''
    }
  });

  const onSubmit = async (data: { username: string; password: string }) => {
    console.log('Tentative de connexion avec:', data);
    try {
      const user = await loginMutation.mutateAsync(data);
      console.log('Connexion réussie, données utilisateur:', user);
      setLocation("/");
    } catch (error: any) {
      console.error('Erreur de connexion:', error);
      toast({
        variant: "destructive",
        title: "Erreur de connexion",
        description: error.message || "Identifiants incorrects"
      });
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="px-8 space-y-4"
      >
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[16px] font-bold text-[#212529] font-[-apple-system,system-ui,Arial,sans-serif]">
                ID de synchronisation
              </FormLabel>
              <div className="flex">
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="Entrez votre ID synchro"
                    className="rounded-l-[4px] rounded-r-none border-r-0 h-[34px] text-[16px] text-[#888F97] font-[-apple-system,system-ui,Arial,sans-serif]"
                  />
                </FormControl>
                <div className="w-[40px] h-[34px] bg-[#E9ECEF] border border-[#CED4DA] rounded-r-[4px] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-[15px] h-[16px] text-[#888F97]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[16px] font-bold text-[#212529] font-[-apple-system,system-ui,Arial,sans-serif]">
                ID Client
              </FormLabel>
              <div className="flex">
                <FormControl>
                  <Input 
                    type="password" 
                    {...field} 
                    placeholder="Entrez votre ID Client"
                    className="rounded-l-[4px] rounded-r-none border-r-0 h-[34px] text-[16px] text-[#888F97] font-[-apple-system,system-ui,Arial,sans-serif]"
                  />
                </FormControl>
                <div className="w-[40px] h-[34px] bg-[#E9ECEF] border border-[#CED4DA] rounded-r-[4px] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-[15px] h-[16px] text-[#888F97]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full h-[38px] bg-[#36599E] hover:bg-[#36599E]/90 text-white font-[-apple-system,system-ui,Arial,sans-serif] text-[16px] mt-6"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Se connecter
        </Button>
      </form>
    </Form>
  );
}