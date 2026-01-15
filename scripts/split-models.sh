#!/usr/bin/env bash
set -euo pipefail

SCHEMA="./prisma/schema.prisma"
MODELS_DIR="prisma/models"

# Delete existing models directory if it exists
if [[ -d "$MODELS_DIR" ]]; then
  rm -rf "$MODELS_DIR"
fi

# Vérifie que le schéma existe
if [[ ! -f "$SCHEMA" ]]; then
  echo "Erreur : fichier $SCHEMA introuvable." >&2
  exit 1
fi

# Crée le dossier models s'il n'existe pas
mkdir -p "$MODELS_DIR"

# Extraction des blocs model ... { ... } avec comptage d'accolades (BSD awk compatible)
awk -v outdir="$MODELS_DIR" '
  BEGIN {
    in_model = 0
    depth = 0
    outfile = ""
  }

  {
    line = $0

    # Détecte le début d un modèle : "model <Nom> {"
    if (in_model == 0 && line ~ /^[[:space:]]*model[[:space:]]+[A-Za-z0-9_]+[[:space:]]*{/) {
      # Récupère le nom du modèle sans utiliser de sous-captures
      model = line
      sub(/^[[:space:]]*model[[:space:]]+/, "", model)   # supprime "model +"
      sub(/[[:space:]]*{.*/, "", model)                  # supprime "   { ..."

      outfile = outdir "/" model ".prisma"
      print "Extraction du modèle " model " → " outfile > "/dev/stderr"

      in_model = 1
      depth = 0
    }

    if (in_model == 1) {
      print line >> outfile

      # Compte les { et } sur la ligne courante
      opens = gsub(/\{/, "{", line)
      closes = gsub(/\}/, "}", line)
      depth += (opens - closes)

      # Si on revient à 0, le bloc est terminé
      if (depth == 0) {
        close(outfile)
        in_model = 0
        outfile = ""
      }
    }
  }
' "$SCHEMA"

echo "Terminé : modèles séparés dans $MODELS_DIR."
