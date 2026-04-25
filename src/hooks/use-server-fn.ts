/**
 * Wrapper de useServerFn que injeta automaticamente o token JWT do Supabase
 * como campo __token no payload de toda chamada de server fn autenticada.
 */
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

type AnyServerFn = (...args: any[]) => Promise<any>;

export function useAuthServerFn<T extends AnyServerFn>(fn: T): T {
  const wrapped = useServerFn(fn);
  return (async (opts: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Não autenticado");

    // Injeta __token no data payload
    const newOpts = {
      ...opts,
      data: { ...(opts?.data ?? {}), __token: token },
    };
    return wrapped(newOpts);
  }) as T;
}
