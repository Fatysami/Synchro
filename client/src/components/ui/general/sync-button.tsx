const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/sync-automate", { type });
      const data = await response.json();
      return data as SyncResponse;
    },
    onSuccess: (data) => {
      toast({
        title: "Synchronisation",
        description: data.retInfo,
        variant: data.retSync === 1 ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Synchronisation",
        description: "La communication avec votre serveur a échoué. Vérifiez que votre service NuxiAutomate est bien démarré et accessible.",
        variant: "destructive",
      });
    },
  });