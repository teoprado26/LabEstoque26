// Entrada com Google (OAuth) e por link de e-mail, no fluxo PKCE do Supabase.
// Web: o Supabase redireciona de volta para /auth/callback e troca o código sozinho (detectSessionInUrl).
// Celular: o navegador do sistema abre o login e devolve labestoque://auth/callback?code=…, que trocamos aqui.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/** URL de retorno do login; precisa estar em Authentication → URL Configuration → Redirect URLs no Supabase. */
export const urlRetorno = () =>
  Platform.OS === 'web' ? `${window.location.origin}/auth/callback` : Linking.createURL('auth/callback');

/** Troca o ?code= do retorno por uma sessão. Ignora se já houver sessão ou se a URL não trouxer código. */
export async function concluirRetorno(url: string): Promise<void> {
  const { queryParams } = Linking.parse(url);
  const erro = queryParams?.error_description ?? queryParams?.error;
  if (erro) throw new Error(String(erro));
  const code = queryParams?.code;
  if (typeof code !== 'string') return;
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}

export async function entrarComGoogle(): Promise<void> {
  const redirectTo = urlRetorno();
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw error;
    return; // a página sai para o Google e volta em /auth/callback
  }
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  const resultado = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (resultado.type === 'success') await concluirRetorno(resultado.url);
}

/** Link de acesso por e-mail (sem senha). Cria a conta no primeiro acesso. */
export async function enviarLinkPorEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: urlRetorno() } });
  if (error) throw error;
}

export async function redefinirSenha(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: urlRetorno() });
  if (error) throw error;
}
