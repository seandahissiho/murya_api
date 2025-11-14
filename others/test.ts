import OpenAI from "openai";
import {GenerateContentResponse, GoogleGenAI} from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY or OPENAI_API_KEY environment variable');
}

console.log("Starting competency taxonomy generation...");
// log the OPENAI_API_KEY env variable is set
// if (!process.env.OPENAI_API_KEY) {
//     console.error("Error: OPENAI_API_KEY environment variable is not set.");
//     process.exit(1);
// }
let ai: any = null;
const isUsingGemini = !!process.env.GEMINI_API_KEY;
const isUsingOpenAI = !!process.env.OPENAI_API_KEY;
if (isUsingGemini) {
    ai = new GoogleGenAI({
        apiKey: apiKey
        // If using Vertex AI, you might pass project & location too
    });

} else if (isUsingOpenAI) {
    ai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 3600 * 1000,       // default is long; set explicitly (e.g., 60s)
        maxRetries: 2          // default is 2; tune per workload
    });
} else {
    throw new Error('No valid AI API key found in environment variables.');
}


const MODEL = "gpt-5"; // adapte

export type AcquisitionLevel = "Facile" | "Moyen" | "Difficile" | "Expert";
export type ProgressionLevel = "Junior" | "Débutant" | "Intermédiaire" | "Senior";
export type BloomLevel = "Se souvenir" | "Comprendre" | "Appliquer" | "Analyser" | "Évaluer" | "Créer";

export interface ConnextraObjective {
    connextra: string; // "En tant que …, je veux … afin de …"
    bloom: BloomLevel;
}

export interface CompetencyNode {
    name: string; // nom libre (multi-mots autorisés)
    acquisitionLevel: AcquisitionLevel;
    progressionLevel: ProgressionLevel;
    bloom: BloomLevel;
    connextra: string; // 1 objectif principal au format Connextra
    // Optionnel: objectifs additionnels (si tu en veux plusieurs)
    // objectives?: ConnextraObjective[];
}

export interface SubFamilyNode {
    name: string; // 1 mot
    competencies: CompetencyNode[]; // 5..15
}

export interface FamilyNode {
    name: string; // 1 mot
    subFamilies: SubFamilyNode[]; // 1..2
}

export interface CompetencyTaxonomy {
    jobTitle: string;
    summary: string;
    families: FamilyNode[]; // 5
}

// ---- SchemaSpec pour la cible ----
const CompetencyTaxonomySchema = {
    jobTitle: {kind: "string"},
    summary: {kind: "string"},
    families: {kind: "object" as const} // on valide structure après parsing
};

export const CompetencyTaxonomyLLM = {
    toLLM: (jobTitle: string) => {
        // Règles explicites pour le LLM (JSON only)
        const constraints = `
Tu es un générateur de taxonomie de compétences.
GENÈRE UNIQUEMENT un JSON valide correspondant exactement à la structure ci-dessous.

Contraintes OBLIGATOIRES :
- 50 compétences au total (compter toutes les entrées "competencies" de toutes les sous-familles).
- 5 familles exactement.
- Pour chaque famille : 1 à 2 sous-familles maximum.
- Pour chaque sous-famille : entre 5 et 15 compétences.
- Le nom de chaque famille et sous-famille doit être UN SEUL MOT (ex: "Design", "Typographie").
- Chaque compétence contient :
  - name: string (nom de la compétence)
  - acquisitionLevel: Facile | Moyen | Difficile | Expert
  - progressionLevel: Junior | Débutant | Intermédiaire | Senior
  - bloom: Se souvenir | Comprendre | Appliquer | Analyser | Évaluer | Créer
  - connextra: "En tant que <persona>, je veux <verbe d'action aligné Bloom + action> afin de <bénéfice mesurable>."
- Utilise des verbes d'action cohérents avec le niveau de Bloom (ex: Se souvenir=énumérer/définir ; Comprendre=expliquer/classer ; Appliquer=mettre en œuvre ; Analyser=différencier/structurer ; Évaluer=critiquer/justifier ; Créer=concevoir/formuler/prototyper).
- Le JSON final doit suivre exactement la structure :

{
  "jobTitle": "string",
  "families": [
    {
      "name": "OneWord",
      "subFamilies": [
        {
          "name": "OneWord",
          "competencies": [
            {
              "kind": "SavoirFaire|SavoirÊtre",
              "name": "string",
              "acquisitionLevel": "Facile|Moyen|Difficile|Expert",
            }
          ]
        }
      ]
    }
  ]
}

- Aucun champ supplémentaire. Aucune explication. Aucune mise en forme Markdown. JSON brut uniquement.
`;

        return [
            `Génère la taxonomie de compétences pour le métier: "${jobTitle}".`,
            constraints
        ].join("\n");
    },

    fromLLM: (json: unknown): CompetencyTaxonomy => {
        // Parsing + validations "métier" (comptages et règles)
        if (typeof json !== "object" || json === null || Array.isArray(json)) {
            throw new Error("fromLLM expects a JSON object");
        }
        const data = json as any;

        // shape de base
        if (typeof data.jobTitle !== "string") throw new Error("jobTitle must be string");
        if (typeof data.summary !== "string") throw new Error("summary must be string");
        if (!Array.isArray(data.families)) throw new Error("families must be array");

        // 5 familles
        if (data.families.length !== 5) throw new Error("Must have exactly 5 families");

        const oneWord = (s: string) => /^[A-Za-zÀ-ÿ]+$/.test((s || "").trim()); // pas d'espace/tiret

        let totalCompetencies = 0;

        for (const f of data.families) {
            if (typeof f?.name !== "string" || !oneWord(f.name)) {
                throw new Error(`Family name must be 1 word: ${f?.name}`);
            }
            if (!Array.isArray(f.subFamilies) || f.subFamilies.length < 1 || f.subFamilies.length > 2) {
                throw new Error(`Each family must have 1..2 subFamilies`);
            }

            for (const sf of f.subFamilies) {
                if (typeof sf?.name !== "string" || !oneWord(sf.name)) {
                    throw new Error(`SubFamily name must be 1 word: ${sf?.name}`);
                }
                if (!Array.isArray(sf.competencies)) {
                    throw new Error(`subFamily.competencies must be array`);
                }
                if (sf.competencies.length < 5 || sf.competencies.length > 15) {
                    throw new Error(`Each subFamily must have 5..15 competencies`);
                }

                for (const c of sf.competencies) {
                    const acq: AcquisitionLevel[] = ["Facile", "Moyen", "Difficile", "Expert"];
                    const prog: ProgressionLevel[] = ["Junior", "Débutant", "Intermédiaire", "Senior"];
                    const bloom: BloomLevel[] = ["Se souvenir", "Comprendre", "Appliquer", "Analyser", "Évaluer", "Créer"];
                    // lowercase and no accent for bloom comparison
                    const normalizedBlooms = bloom.map(b => b.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

                    if (typeof c?.name !== "string") throw new Error("competency.name must be string");
                    if (!acq.includes(c.acquisitionLevel)) throw new Error("invalid acquisitionLevel");
                    if (!prog.includes(c.progressionLevel)) throw new Error("invalid progressionLevel");
                    if (!normalizedBlooms.includes(c.bloom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) throw new Error("invalid bloom");
                    if (typeof c?.connextra !== "string" || !c.connextra.startsWith("En tant que")) {
                        throw new Error("connextra must be a Connextra sentence starting with 'En tant que'");
                    }
                    totalCompetencies++;
                }
            }
        }

        if (totalCompetencies !== 50) {
            throw new Error(`Must have exactly 50 competencies (current: ${totalCompetencies})`);
        }

        return data as CompetencyTaxonomy;
    }
};

// --- streaming askLLM (drop-in) ---
async function askLLM<T>(
    instruction: string,
    fromLLM: (json: unknown) => T
): Promise<T> {
    let response: any;
    let raw: string = "";
    if (isUsingGemini) {
        response = await ai?.models.generateContent({
            model: 'gemini-2.5-flash',      // choose the model name you need
            contents: 'Explain how AI works in a few words'
        });
        raw = response?.text;

    } else if (isUsingOpenAI) {
        response = await ai?.chat.completions.create({
            model: MODEL,
            stream: false,
            messages: [{role: "user", content: instruction}],
            // Comment this line if your model doesn't support JSON mode in streaming
            response_format: {type: "json_object"}
        });
        raw = response.choices[0]?.message?.content?.trim() ?? "";
    } else {
        throw new Error('No valid AI API client available.');
    }


    const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    // let buffer = "";
    // for await (const chunk of stream) {
    //     process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
    //     const delta = chunk.choices?.[0]?.delta?.content ?? "";
    //     if (delta) buffer += delta;
    // }
    //
    // // Some models wrap JSON in code fences; strip defensively
    // const jsonText = buffer.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
        const parsed = JSON.parse(jsonText);
        // const parsed = JSON.parse("{\n" +
        //     "\"jobTitle\": \"UI Designer\",\n" +
        //     "\"summary\": \"Taxonomie de compétences clés pour concevoir des interfaces utiles, utilisables et désirables, de la recherche à la livraison.\",\n" +
        //     "\"families\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Recherche\",\n" +
        //     "\"subFamilies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Utilisateur\",\n" +
        //     "\"competencies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Personas\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Débutant\",\n" +
        //     "\"bloom\": \"Comprendre\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux expliquer les besoins types des utilisateurs afin de orienter les priorités de conception mesurées par l'adoption.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Parcours Utilisateur\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Analyser\",\n" +
        //     "\"connextra\": \"En tant que chef de produit, je veux différencier les étapes critiques du parcours afin de réduire le temps de tâche de 20%.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Interviews\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Débutant\",\n" +
        //     "\"bloom\": \"Appliquer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux mettre en œuvre des entretiens semi-directifs afin de obtenir 10 insights actionnables par cycle.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Tri Cartes\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Analyser\",\n" +
        //     "\"connextra\": \"En tant que architecte information, je veux structurer des regroupements de contenus afin de augmenter le taux de trouvabilité de 30%.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Journalisation\",\n" +
        //     "\"acquisitionLevel\": \"Difficile\",\n" +
        //     "\"progressionLevel\": \"Senior\",\n" +
        //     "\"bloom\": \"Évaluer\",\n" +
        //     "\"connextra\": \"En tant que chercheur, je veux critiquer les comportements réels via des études journalières afin de valider les hypothèses avec un échantillon représentatif.\"\n" +
        //     "}\n" +
        //     "]\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Données\",\n" +
        //     "\"competencies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Analytics\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Analyser\",\n" +
        //     "\"connextra\": \"En tant que analyste, je veux différencier les métriques d'usage afin de isoler les goulots et augmenter la rétention J7 de 10%.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"A/B\",\n" +
        //     "\"acquisitionLevel\": \"Difficile\",\n" +
        //     "\"progressionLevel\": \"Senior\",\n" +
        //     "\"bloom\": \"Évaluer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux justifier la variante gagnante afin de améliorer le taux de clic avec un p<0,05.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Heatmaps\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Débutant\",\n" +
        //     "\"bloom\": \"Comprendre\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux classer les zones d'attention afin de prioriser les éléments critiques sur les écrans clés.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Feedback\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Junior\",\n" +
        //     "\"bloom\": \"Se souvenir\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux énumérer les retours récurrents afin de alimenter la backlog de corrections priorisées.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"SuccessMetrics\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Créer\",\n" +
        //     "\"connextra\": \"En tant que chef de produit, je veux formuler des indicateurs de succès afin de mesurer l'impact de chaque livraison.\"\n" +
        //     "}\n" +
        //     "]\n" +
        //     "}\n" +
        //     "]\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Design\",\n" +
        //     "\"subFamilies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Interface\",\n" +
        //     "\"competencies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Hiérarchie\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Junior\",\n" +
        //     "\"bloom\": \"Appliquer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux mettre en œuvre une hiérarchie visuelle afin de réduire la charge cognitive et les erreurs de navigation.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Layout\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Créer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux concevoir des grilles réactives afin de maximiser la lisibilité sur trois breakpoints.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Couleurs\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Débutant\",\n" +
        //     "\"bloom\": \"Comprendre\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux expliquer les contrastes et harmonies afin de améliorer la perception et l'accessibilité.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Icônes\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Junior\",\n" +
        //     "\"bloom\": \"Créer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux prototyper un set d'icônes cohérent afin de accélérer la compréhension des actions.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Microcopie\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Évaluer\",\n" +
        //     "\"connextra\": \"En tant que rédacteur, je veux justifier les libellés afin de augmenter le taux de réussite des formulaires.\"\n" +
        //     "}\n" +
        //     "]\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Typographie\",\n" +
        //     "\"competencies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Pairing\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Créer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux concevoir des associations de polices afin de améliorer la lisibilité et l'identité.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Rythme\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Junior\",\n" +
        //     "\"bloom\": \"Appliquer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux mettre en œuvre le rythme vertical afin de stabiliser les blocs de texte sur mobile.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Échelle\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Débutant\",\n" +
        //     "\"bloom\": \"Se souvenir\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux définir une échelle modulaire afin de standardiser les tailles de texte.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Lisibilité\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Analyser\",\n" +
        //     "\"connextra\": \"En tant que chercheur, je veux structurer des tests de lecture afin de réduire le taux d'abandon de 15%.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"SystèmeGrille\",\n" +
        //     "\"acquisitionLevel\": \"Difficile\",\n" +
        //     "\"progressionLevel\": \"Senior\",\n" +
        //     "\"bloom\": \"Créer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux formuler des grilles typographiques afin de assurer une cohérence inter-écrans.\"\n" +
        //     "}\n" +
        //     "]\n" +
        //     "}\n" +
        //     "]\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Prototype\",\n" +
        //     "\"subFamilies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Interaction\",\n" +
        //     "\"competencies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Flux\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Débutant\",\n" +
        //     "\"bloom\": \"Comprendre\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux expliquer les flux d'écran afin de aligner l'équipe sur le scénario cible.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Transitions\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Appliquer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux mettre en œuvre des transitions signifiantes afin de guider l'attention et réduire l'ambiguïté.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"États\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Junior\",\n" +
        //     "\"bloom\": \"Se souvenir\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux énumérer les états d'interface afin de éviter les cas non gérés en développement.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Gestes\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Analyser\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux différencier les gestes natifs afin de choisir les interactions les plus attendues.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Animations\",\n" +
        //     "\"acquisitionLevel\": \"Difficile\",\n" +
        //     "\"progressionLevel\": \"Senior\",\n" +
        //     "\"bloom\": \"Créer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux prototyper des micro-interactions afin de améliorer la perception de vitesse perçue.\"\n" +
        //     "}\n" +
        //     "]\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Test\",\n" +
        //     "\"competencies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"PlanTest\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Créer\",\n" +
        //     "\"connextra\": \"En tant que chercheur, je veux formuler des protocoles de test afin de mesurer le taux de réussite des tâches.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Modération\",\n" +
        //     "\"acquisitionLevel\": \"Difficile\",\n" +
        //     "\"progressionLevel\": \"Senior\",\n" +
        //     "\"bloom\": \"Évaluer\",\n" +
        //     "\"connextra\": \"En tant que chercheur, je veux critiquer les comportements observés afin de prioriser les problèmes par sévérité.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"NonGuidé\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Appliquer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux mettre en œuvre des tests non modérés afin de recueillir 30 réponses en 48h.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Synthèse\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Analyser\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux structurer les constats afin de dégager cinq axes d'amélioration priorisés.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Rapports\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Junior\",\n" +
        //     "\"bloom\": \"Comprendre\",\n" +
        //     "\"connextra\": \"En tant que chef de projet, je veux classer les résultats afin de communiquer clairement aux parties prenantes.\"\n" +
        //     "}\n" +
        //     "]\n" +
        //     "}\n" +
        //     "]\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Système\",\n" +
        //     "\"subFamilies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Composants\",\n" +
        //     "\"competencies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Bibliothèque\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Créer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux concevoir une bibliothèque de composants afin de réduire le temps de design de 40%.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Variantes\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Appliquer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux mettre en œuvre des variantes et états afin de couvrir les cas d'usage essentiels.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Tokens\",\n" +
        //     "\"acquisitionLevel\": \"Difficile\",\n" +
        //     "\"progressionLevel\": \"Senior\",\n" +
        //     "\"bloom\": \"Créer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux formuler des design tokens afin de synchroniser style et code à l'échelle.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Nommage\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Junior\",\n" +
        //     "\"bloom\": \"Se souvenir\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux définir des conventions de nommage afin de retrouver rapidement les éléments.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Documentation\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Évaluer\",\n" +
        //     "\"connextra\": \"En tant que chef de projet, je veux justifier les règles d'usage afin de garantir la cohérence inter-équipes.\"\n" +
        //     "}\n" +
        //     "]\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Accessibilité\",\n" +
        //     "\"competencies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Contraste\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Junior\",\n" +
        //     "\"bloom\": \"Appliquer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux mettre en œuvre des contrastes conformes afin de atteindre WCAG AA sur toutes les pages.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Clavier\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Analyser\",\n" +
        //     "\"connextra\": \"En tant que QA, je veux différencier les pièges de navigation clavier afin de améliorer l'accès sans souris.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Lecteurs\",\n" +
        //     "\"acquisitionLevel\": \"Difficile\",\n" +
        //     "\"progressionLevel\": \"Senior\",\n" +
        //     "\"bloom\": \"Évaluer\",\n" +
        //     "\"connextra\": \"En tant que chercheur, je veux critiquer la compatibilité lecteurs d'écran afin de réduire les blocages à zéro critique.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"SousTitres\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Débutant\",\n" +
        //     "\"bloom\": \"Comprendre\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux expliquer les normes de sous-titrage afin de rendre les médias inclusifs.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Formulaires\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Créer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux concevoir des formulaires accessibles afin de augmenter le taux de complétion de 15%.\"\n" +
        //     "}\n" +
        //     "]\n" +
        //     "}\n" +
        //     "]\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Collaboration\",\n" +
        //     "\"subFamilies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Produit\",\n" +
        //     "\"competencies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Objectifs\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Junior\",\n" +
        //     "\"bloom\": \"Se souvenir\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux définir les objectifs et contraintes afin de aligner la direction dès le départ.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Roadmap\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Analyser\",\n" +
        //     "\"connextra\": \"En tant que chef de produit, je veux structurer les livrables afin de livrer valeur et apprentissages à chaque incrément.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"KPI\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Évaluer\",\n" +
        //     "\"connextra\": \"En tant que chef de produit, je veux justifier les KPI choisis afin de suivre l'impact des fonctionnalités.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Ateliers\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Débutant\",\n" +
        //     "\"bloom\": \"Appliquer\",\n" +
        //     "\"connextra\": \"En tant que facilitateur, je veux mettre en œuvre des ateliers co-créatifs afin de générer 20 idées exploitables.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Brief\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Junior\",\n" +
        //     "\"bloom\": \"Comprendre\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux expliquer le brief de design afin de clarifier portée, délais et livrables.\"\n" +
        //     "}\n" +
        //     "]\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Équipe\",\n" +
        //     "\"competencies\": [\n" +
        //     "{\n" +
        //     "\"name\": \"Handoff\",\n" +
        //     "\"acquisitionLevel\": \"Moyen\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Appliquer\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux mettre en œuvre un handoff clair afin de réduire les retours de 50% en développement.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Critiques\",\n" +
        //     "\"acquisitionLevel\": \"Difficile\",\n" +
        //     "\"progressionLevel\": \"Senior\",\n" +
        //     "\"bloom\": \"Évaluer\",\n" +
        //     "\"connextra\": \"En tant que lead, je veux critiquer les solutions avec critères partagés afin de améliorer la qualité perçue à chaque itération.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Mentorat\",\n" +
        //     "\"acquisitionLevel\": \"Expert\",\n" +
        //     "\"progressionLevel\": \"Senior\",\n" +
        //     "\"bloom\": \"Créer\",\n" +
        //     "\"connextra\": \"En tant que lead, je veux concevoir des parcours de montée en compétences afin de accélérer l'autonomie des juniors.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Communication\",\n" +
        //     "\"acquisitionLevel\": \"Facile\",\n" +
        //     "\"progressionLevel\": \"Débutant\",\n" +
        //     "\"bloom\": \"Comprendre\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux expliquer les décisions de design afin de obtenir l'adhésion des parties prenantes.\"\n" +
        //     "},\n" +
        //     "{\n" +
        //     "\"name\": \"Éthique\",\n" +
        //     "\"acquisitionLevel\": \"Difficile\",\n" +
        //     "\"progressionLevel\": \"Intermédiaire\",\n" +
        //     "\"bloom\": \"Analyser\",\n" +
        //     "\"connextra\": \"En tant que designer, je veux différencier les risques d'usage trompeur afin de éviter les dark patterns mesurés par des audits.\"\n" +
        //     "}\n" +
        //     "]\n" +
        //     "}\n" +
        //     "]\n" +
        //     "}\n" +
        //     "]\n" +
        //     "}\n");
        return fromLLM(parsed);
    } catch (e) {
        // Helpful diagnostics on malformed JSON
        // console.error("Raw streamed text (truncated to 500 chars):", jsonText.slice(0, 500));
        return askLLM(instruction, fromLLM);
        // throw new Error("LLM did not return valid JSON.");
    }
}

// Génération end-to-end
export async function generateCompetencyTaxonomy(jobTitle: string) {
    const instruction = CompetencyTaxonomyLLM.toLLM(jobTitle);
    return await askLLM<CompetencyTaxonomy>(instruction, CompetencyTaxonomyLLM.fromLLM);
}

// Exemple
generateCompetencyTaxonomy("Product Manager").then(async (data) => {
    console.log(JSON.stringify(data, null, 2));
});
