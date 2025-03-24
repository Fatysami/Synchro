import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download } from "lucide-react";
import { saveAs } from 'file-saver';

// Fonctions utilitaires pour l'encodage UTF-8
function decodeUTF8String(str: string | undefined): string {
  if (str === undefined) return '';
  try {
    return decodeURIComponent(escape(str));
  } catch (error) {
    console.error("Error decoding UTF-8 string:", error);
    return str;
  }
}

function encodeUTF8String(str: string): string {
  if (!str) return '';
  try {
    return unescape(encodeURIComponent(str));
  } catch (error) {
    console.error("Error encoding UTF-8 string:", error);
    return str;
  }
}

interface XMLField {
  tag: string;
  value: string;
  path: string;
  parentPath: string;
  level: number;
  occurrence: number;
  totalOccurrences: number;
}

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idInterne: string;
}

const MAX_XML_SIZE = 50 * 1024 * 1024; // 50MB pour correspondre à la limite serveur

export function EditDialog({ open, onOpenChange, idInterne }: EditDialogProps) {
  const [fields, setFields] = useState<XMLField[]>([]);
  const [loading, setLoading] = useState(true);
  const [originalXmlDoc, setOriginalXmlDoc] = useState<Document | null>(null);
  const [isGedDocument, setIsGedDocument] = useState(false);
  const [documentName, setDocumentName] = useState<string>("");
  const [documentContent, setDocumentContent] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    if (open && idInterne) {
      setLoading(true);
      setIsGedDocument(false);
      setDocumentName("");
      setDocumentContent("");

      fetch(`/api/sync-history/${idInterne}/xml`)
        .then(res => res.json())
        .then(data => {
          const xmlString = decodeUTF8String(data.enreg);
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlString, "text/xml");
          setOriginalXmlDoc(xmlDoc);
          const fields: XMLField[] = [];

          function extractFields(node: Element, parentPath = "", level = 0) {
            const childrenByTag = new Map<string, Element[]>();
            Array.from(node.children).forEach(child => {
              const tag = child.tagName;
              if (!childrenByTag.has(tag)) {
                childrenByTag.set(tag, []);
              }
              childrenByTag.get(tag)!.push(child as Element);
            });

            childrenByTag.forEach((children, tag) => {
              children.forEach((child, index) => {
                const hasSiblings = children.length > 1;
                const currentPath = parentPath ?
                  `${parentPath}/${tag}${hasSiblings ? `[${index + 1}]` : ''}` :
                  tag;

                if (child.children.length === 0) {
                  const value = child.textContent || "";

                  // Vérifier si c'est un document GED
                  if (tag === 'Table' && value.toLowerCase() === 'ged') {
                    setIsGedDocument(true);
                  }

                  // Si c'est un document GED, stocker les informations nécessaires
                  if (tag === 'NomDocument') {
                    setDocumentName(value);
                  } else if (tag === 'BinaireDocument') {
                    setDocumentContent(value);
                  }

                  fields.push({
                    tag,
                    value,
                    path: currentPath,
                    parentPath: currentPath.split('/').slice(0, -1).join('/'),
                    level,
                    occurrence: index + 1,
                    totalOccurrences: children.length
                  });
                } else {
                  extractFields(child, currentPath, level + 1);
                }
              });
            });
          }

          extractFields(xmlDoc.documentElement);
          setFields(fields);
          setLoading(false);
        })
        .catch(error => {
          console.error("Erreur chargement XML:", error);
          toast({
            title: "Erreur",
            description: "Impossible de charger les données XML",
            variant: "destructive",
          });
          onOpenChange(false);
        });
    }
  }, [open, idInterne]);

  const handleDownload = () => {
    try {
      if (!documentName || !documentContent) {
        toast({
          title: "Erreur",
          description: "Nom du document ou contenu manquant",
          variant: "destructive",
        });
        return;
      }

      // Décoder le contenu Base64
      const binaryContent = atob(documentContent.replace(/\s/g, ''));
      const bytes = new Uint8Array(binaryContent.length);
      for (let i = 0; i < binaryContent.length; i++) {
        bytes[i] = binaryContent.charCodeAt(i);
      }

      // Créer un blob et télécharger
      const blob = new Blob([bytes]);
      saveAs(blob, documentName);

      toast({
        title: "Succès",
        description: "Document téléchargé avec succès",
      });
    } catch (error) {
      console.error("Erreur lors du téléchargement:", error);
      toast({
        title: "Erreur",
        description: "Impossible de télécharger le document",
        variant: "destructive",
      });
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (fields: XMLField[]) => {
      if (!originalXmlDoc) {
        throw new Error("Document XML original non disponible");
      }

      const xmlDoc = originalXmlDoc.cloneNode(true) as Document;

      function updateFields(node: Element, parentPath = "") {
        const childrenByTag = new Map<string, Element[]>();
        Array.from(node.children).forEach(child => {
          const tag = child.tagName;
          if (!childrenByTag.has(tag)) {
            childrenByTag.set(tag, []);
          }
          childrenByTag.get(tag)!.push(child as Element);
        });

        childrenByTag.forEach((children, tag) => {
          children.forEach((child, index) => {
            const hasSiblings = children.length > 1;
            const currentPath = parentPath ?
              `${parentPath}/${tag}${hasSiblings ? `[${index + 1}]` : ''}` :
              tag;

            if (child.children.length === 0) {
              const field = fields.find(f => f.path === currentPath);
              if (field) {
                try {
                  child.textContent = encodeUTF8String(field.value);
                } catch (error) {
                  console.error(`Erreur d'encodage pour le champ ${currentPath}:`, error);
                  throw new Error(`Erreur d'encodage pour le champ ${field.tag}`);
                }
              }
            } else {
              updateFields(child, currentPath);
            }
          });
        });
      }

      try {
        updateFields(xmlDoc.documentElement);
        const serializer = new XMLSerializer();
        const xmlString = serializer.serializeToString(xmlDoc);

        // Vérifier la taille du XML
        const xmlSize = new Blob([xmlString]).size;
        const maxSize = MAX_XML_SIZE;

        if (xmlSize > maxSize) {
          throw new Error(`Le fichier XML est trop volumineux (${(xmlSize / 1024 / 1024).toFixed(2)}MB). La taille maximale autorisée est de ${maxSize / 1024 / 1024}MB.`);
        }

        const response = await apiRequest(
          "PUT",
          `/api/sync-history/${idInterne}/xml`,
          { xml: xmlString }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 413) {
            throw new Error(`Le fichier XML est trop volumineux pour être traité par le serveur. Taille: ${(xmlSize / 1024 / 1024).toFixed(2)}MB`);
          }
          throw new Error(errorData.error || "Échec de la mise à jour");
        }
      } catch (error) {
        console.error("Erreur lors de la mise à jour XML:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-history"] });
      toast({
        title: "Succès",
        description: "Les modifications ont été enregistrées",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de sauvegarder les modifications",
        variant: "destructive",
      });
    },
  });

  const groupFieldsByParent = () => {
    const groups = new Map<string, XMLField[]>();

    fields.forEach(field => {
      if (field.level === 0) {
        if (!groups.has('')) {
          groups.set('', []);
        }
        groups.get('')!.push(field);
        return;
      }

      let currentPath = field.path;
      let foundParent = false;

      while (currentPath.includes('/') && !foundParent) {
        currentPath = currentPath.split('/').slice(0, -1).join('/');
        const siblings = fields.filter(f =>
          f.path.startsWith(currentPath + '/') &&
          f.path.split('/').length === currentPath.split('/').length + 1
        );

        if (siblings.length > 0) {
          if (!groups.has(currentPath)) {
            groups.set(currentPath, []);
          }
          if (!groups.get(currentPath)!.includes(field)) {
            groups.get(currentPath)!.push(field);
          }
          foundParent = true;
        }
      }
    });

    return groups;
  };

  const formatPath = (path: string) => {
    if (!path) return '';
    return path.split('/').map(part => {
      const match = part.match(/^(.*?)(?:\[(\d+)\])?$/);
      if (match) {
        const [, name, index] = match;
        return index ? `${name}[${index}]` : name;
      }
      return part;
    }).join('/');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[80vh] overflow-y-auto"
        aria-describedby="dialog-description"
      >
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Modifier les données XML</DialogTitle>
          <div className="flex gap-2">
            {isGedDocument && documentName && documentContent && (
              <Button
                variant="outline"
                onClick={handleDownload}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Download className="mr-2 h-4 w-4" />
                Télécharger le document
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={() => updateMutation.mutate(fields)}
              disabled={updateMutation.isPending}
              className="w-[116px] h-[38px] text-[14px] rounded-[4px] bg-[#36599E] hover:bg-[#0A2A69] active:bg-[#85A3DE] text-white disabled:opacity-50"
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Valider
            </Button>
          </div>
        </DialogHeader>

        <div id="dialog-description" className="sr-only">
          Éditeur pour modifier les données XML de l'importation
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-0.5">
            {Array.from(groupFieldsByParent()).map(([parentPath, groupFields]) => {
              const key = parentPath || 'root';
              return (
                <div key={key}>
                  {parentPath && (
                    <div className="bg-accent text-accent-foreground py-1.5 px-4 -mx-6">
                      <div className="font-medium">
                        {formatPath(parentPath)}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-[200px_1fr] gap-1 px-4 py-1">
                    {groupFields.map((field, index) => (
                      <div key={`${field.path}-${index}`} className="contents">
                        <div className="font-medium text-right py-0.5">{field.tag}</div>
                        <Input
                          value={field.value}
                          onChange={(e) => {
                            const newFields = [...fields];
                            const fieldIndex = newFields.findIndex(f => f.path === field.path);
                            if (fieldIndex !== -1) {
                              newFields[fieldIndex].value = e.target.value;
                              setFields(newFields);
                            }
                          }}
                          className="h-7"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}