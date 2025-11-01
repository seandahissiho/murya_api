#!/usr/bin/env bash
set -euo pipefail

# 1) Reconstruire schema.prisma
cat prisma/partials/generator.prisma > prisma/schema.prisma
cat prisma/partials/datasource.prisma >> prisma/schema.prisma
cat prisma/partials/enums.prisma >> prisma/schema.prisma
cat prisma/models/*.prisma >> prisma/schema.prisma

echo "✅ schema.prisma reconstruit."

# 2) Supprimer les lignes vides ou ne contenant que des espaces
#    On utilise grep pour plus de portabilité sur macOS/Linux
grep -v '^[[:space:]]*$' prisma/schema.prisma > prisma/schema.tmp \
  && mv prisma/schema.tmp prisma/schema.prisma

echo "✅ schema.prisma reconstruit (sans lignes vides)."

# 3) Générer le client Prisma
npx prisma generate
echo "✅ Prisma client généré."

# 4) Vérifier si le client a été généré
if [[ -d "node_modules/.prisma/client" ]]; then
  echo "✅ Client Prisma trouvé dans node_modules/.prisma/client."
else
  echo "❌ Client Prisma non trouvé dans node_modules/.prisma/client."
fi

## 5) Supprimer le contenu du schema.prisma after 1mn
##sleep 5
#echo "" > prisma/schema.prisma
#echo "✅ Contenu de schema.prisma supprimé."