import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Intercepteur de logs pour le debug
const logger = {
  log: (...args: any[]) => {
    console.log("🔄 [API]", ...args);
  },
  error: (...args: any[]) => {
    console.error("❌ [API]", ...args);
  }
};

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    try {
      const errorBody = await res.text();
      if (errorBody) {
        // Try to parse as JSON if possible
        try {
          const jsonError = JSON.parse(errorBody);
          errorMessage = jsonError.message || errorBody;
        } catch {
          errorMessage = errorBody;
        }
      }
    } catch (e) {
      console.error("Erreur lors de la lecture de l'erreur:", e);
    }

    // Log détaillé de l'erreur
    logger.error(`HTTP ${res.status}: ${errorMessage}`);
    throw new Error(`${res.status}: ${errorMessage}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  logger.log(`${method} ${url} début`);

  // Configuration de base de la requête
  const requestConfig: RequestInit = {
    method,
    credentials: "include",
    headers: {}
  };

  // Si nous avons des données à envoyer
  if (data) {
    // Pour les requêtes PUT/POST avec des données volumineuses, utiliser une compression
    if (method === 'PUT' || method === 'POST') {
      requestConfig.headers = {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Transfer-Encoding': 'chunked'
      };
      // Convertir les données en JSON une seule fois
      requestConfig.body = JSON.stringify(data);
    }
  }

  try {
    const res = await fetch(url, requestConfig);

    logger.log(`${method} ${url} réponse:`, {
      status: res.status,
      ok: res.ok,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries())
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    logger.error(`Erreur ${method} ${url}:`, error);
    throw error;
  }
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    logger.log(`Exécution requête ${url}`);

    const res = await fetch(url, {
      credentials: "include",
    });

    logger.log(`Réponse ${url}:`, {
      status: res.status,
      ok: res.ok
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    const data = await res.json();
    logger.log(`Données reçues ${url}:`, data);
    return data;
  };

type UnauthorizedBehavior = "returnNull" | "throw";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 0,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});