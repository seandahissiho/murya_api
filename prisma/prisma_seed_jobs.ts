import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// -----------------------------
// Seed des JobFamilies + Jobs
// -----------------------------
// NB: Ce seed supprime d'abord les données existantes pour éviter les doublons,
// puis recrée les familles et les métiers en les reliant via jobFamilyId.

const jobFamilies = [
  { name: 'Développement & Programmation' },
  { name: 'Cloud & Infrastructure' },
  { name: 'Cybersécurité' },
  { name: 'Data & IA' },
  { name: 'Design & Expérience Utilisateur' },
  { name: 'Gestion, Produit & Méthodologie' },
  { name: 'Support & Maintenance' },
  { name: 'Hardware, IoT & Embarqués' },
  { name: 'Spécialisations & Transverse' },
] as const

type FamilyName = typeof jobFamilies[number]['name']

const jobs: { title: string; description: string; family: FamilyName }[] = [
  // Développement & Programmation
  { title: 'Développeur Front-End', family: 'Développement & Programmation', description: "Conçoit et implémente des interfaces web accessibles et performantes (HTML/CSS/TS : React, Vue, Angular)." },
  { title: 'Développeur Back-End', family: 'Développement & Programmation', description: "Développe des APIs et la logique serveur, gère sécurité, auth et persistance des données." },
  { title: 'Développeur Full-Stack', family: 'Développement & Programmation', description: "Intervient du front au back, du prototypage à la prod, garantit la cohérence de bout en bout." },
  { title: 'Développeur Mobile (iOS / Android)', family: 'Développement & Programmation', description: "Crée des apps natives et intègre les capacités du device (caméra, GPS, notifications)." },
  { title: 'Développeur Flutter', family: 'Développement & Programmation', description: "Développe des apps cross‑platform Flutter/Dart avec des performances proches du natif." },
  { title: 'Développeur React Native', family: 'Développement & Programmation', description: "Conçoit des apps mobiles multiplateformes, intègre modules natifs si nécessaire." },
  { title: 'Développeur Web', family: 'Développement & Programmation', description: "Réalise des sites et apps web, veille compatibilité navigateurs et SEO technique." },
  { title: 'Développeur Java', family: 'Développement & Programmation', description: "Crée services et apps Java (Spring, Quarkus), architectures robustes et scalables." },
  { title: 'Développeur Python', family: 'Développement & Programmation', description: "Conçoit backends, scripts et services data/ML (Django, FastAPI, Flask)." },
  { title: 'Développeur Node.js', family: 'Développement & Programmation', description: "Crée APIs/microservices (Express, NestJS) avec tests et CI/CD." },
  { title: 'Développeur PHP / Laravel / Symfony', family: 'Développement & Programmation', description: "Apps web modernes en PHP (Laravel, Symfony), performance et sécurité." },
  { title: 'Développeur .NET / C#', family: 'Développement & Programmation', description: ".NET/C# pour services, APIs et apps web/desktop (ASP.NET Core, Blazor)." },
  { title: 'Développeur C / C++', family: 'Développement & Programmation', description: "Logiciels système/embarqué, fortes contraintes de perf et mémoire." },
  { title: 'Développeur Go (Golang)', family: 'Développement & Programmation', description: "Services concurrents performants pour microservices et infra cloud." },
  { title: 'Développeur Rust', family: 'Développement & Programmation', description: "Logiciels sûrs et rapides en Rust pour systèmes, backend ou WASM." },
  { title: 'Développeur Ruby on Rails', family: 'Développement & Programmation', description: "Apps web livrées rapidement avec Rails, conventions et tests." },
  { title: 'Développeur Kotlin', family: 'Développement & Programmation', description: "Apps Android et backends Kotlin (Ktor/Spring), langage concis et sûr." },
  { title: 'Développeur Swift', family: 'Développement & Programmation', description: "Apps iOS/iPadOS/macOS (UIKit/SwiftUI), forte exigence UX." },
  { title: 'Développeur Game (Unity / Unreal Engine)', family: 'Développement & Programmation', description: "Gameplay, outils et pipelines de rendu pour jeux vidéo." },
  { title: 'Développeur Blockchain / Web3', family: 'Développement & Programmation', description: "dApps, interactions on‑chain et intégrations de wallets (public/privé)." },
  { title: 'Développeur Smart Contracts (Solidity)', family: 'Développement & Programmation', description: "Écrit, teste et audite des smart contracts avec focus sécurité/gas." },
  { title: 'Intégrateur Web', family: 'Développement & Programmation', description: "Transforme maquettes en pages web responsive et accessibles." },
  { title: 'Développeur CMS (WordPress, Drupal, Joomla)', family: 'Développement & Programmation', description: "Implémente et personnalise des CMS, thèmes/plugins et sécurité." },
  { title: 'Ingénieur Logiciel', family: 'Développement & Programmation', description: "Conçoit/maintient des logiciels avec bonnes pratiques d’architecture et de tests." },
  { title: 'Architecte Logiciel', family: 'Développement & Programmation', description: "Définit l’architecture applicative, choisit stacks/patterns et guide les équipes." },
  { title: 'Testeur QA / QA Engineer', family: 'Développement & Programmation', description: "Plans de test, exécution manuelle/auto, gestion des anomalies." },
  { title: 'Ingénieur en automatisation des tests', family: 'Développement & Programmation', description: "Frameworks de tests auto (UI, API, E2E) intégrés à la CI/CD." },
  { title: 'Ingénieur DevOps / CI-CD', family: 'Développement & Programmation', description: "Industrialise build/tests/déploiements, automatise l’infra et surveille la prod." },

  // Cloud & Infrastructure
  { title: 'Administrateur Systèmes et Réseaux', family: 'Cloud & Infrastructure', description: "Administre serveurs, réseaux, annuaires et politiques de sécurité." },
  { title: 'Ingénieur Systèmes', family: 'Cloud & Infrastructure', description: "Plateformes Linux/Windows, virtualisation et haute dispo." },
  { title: 'Ingénieur Réseaux', family: 'Cloud & Infrastructure', description: "Conçoit/configure réseaux LAN/WAN/Wi‑Fi, routage, QoS et sécurité." },
  { title: 'Architecte Cloud', family: 'Cloud & Infrastructure', description: "Conçoit architectures cloud (AWS/Azure/GCP) scalables, sécurisées et optimisées coûts." },
  { title: 'Ingénieur Cloud (AWS, Azure, GCP)', family: 'Cloud & Infrastructure', description: "Implémente services managés, automatise l’infra et assure résilience." },
  { title: 'Spécialiste Kubernetes / Docker', family: 'Cloud & Infrastructure', description: "Orchestration de conteneurs, manifests, autoscaling et observabilité." },
  { title: 'Ingénieur Infrastructure as Code (Terraform, Ansible)', family: 'Cloud & Infrastructure', description: "Provisionnement et configuration de l’infra via IaC." },
  { title: 'Administrateur Base de Données (DBA)', family: 'Cloud & Infrastructure', description: "Installe, optimise et sécurise SGBD (Postgres, MySQL, SQL Server, Oracle)." },
  { title: 'Ingénieur Stockage / Virtualisation', family: 'Cloud & Infrastructure', description: "Gère SAN/NAS, hyperviseurs et PRA, optimise capacité/perf." },
  { title: 'Technicien Informatique', family: 'Cloud & Infrastructure', description: "Installe, maintient et dépanne postes, périphériques et réseaux." },
  { title: 'Technicien Support N1 / N2 / N3', family: 'Cloud & Infrastructure', description: "Support utilisateur multi‑niveaux, diagnostic et escalade." },
  { title: 'Responsable IT / IT Manager', family: 'Cloud & Infrastructure', description: "Pilote l’équipe IT, budgets, SLA et relations métiers." },

  // Cybersécurité
  { title: 'Analyste en Cybersécurité', family: 'Cybersécurité', description: "Surveille menaces, analyse alertes et applique mesures de protection." },
  { title: 'Ingénieur Sécurité', family: 'Cybersécurité', description: "Déploie contrôles de sécurité, durcit systèmes et évalue les risques." },
  { title: 'Pentester (Test d’intrusion)', family: 'Cybersécurité', description: "Audits techniques offensifs pour identifier les vulnérabilités." },
  { title: 'Expert en Sécurité Réseau', family: 'Cybersécurité', description: "Conçoit architectures réseau sécurisées, firewalls, VPN, IDS/IPS." },
  { title: 'RSSI (Responsable Sécurité des Systèmes d’Information)', family: 'Cybersécurité', description: "Stratégie sécurité, gouvernance, conformité et réponse aux incidents majeurs." },
  { title: 'Consultant Sécurité', family: 'Cybersécurité', description: "Politiques, normes, audits et plans de remédiation sécurité." },
  { title: 'Analyste SOC', family: 'Cybersécurité', description: "Surveillance temps réel via SIEM/EDR, qualification et réponse incidents." },
  { title: 'Architecte Sécurité', family: 'Cybersécurité', description: "Architecture applicative/cloud sécurisée, définition de standards." },
  { title: 'Spécialiste Forensic / Investigation numérique', family: 'Cybersécurité', description: "Collecte et analyse de preuves numériques pour enquêtes/post‑mortems." },
  { title: 'Expert en Sécurité Cloud', family: 'Cybersécurité', description: "Contrôles, identités et conformité spécifiques au cloud." },

  // Data & IA
  { title: 'Data Analyst', family: 'Data & IA', description: "Explore/visualise données, KPIs et dashboards pour décisions." },
  { title: 'Data Scientist', family: 'Data & IA', description: "Modèles statistiques/ML, expérimentation et évaluation métier." },
  { title: 'Data Engineer', family: 'Data & IA', description: "Pipelines ETL/ELT, fiabilité et qualité des données." },
  { title: 'Machine Learning Engineer', family: 'Data & IA', description: "Entraînement, déploiement et monitoring des modèles ML/IA." },
  { title: 'AI Engineer / Ingénieur en IA', family: 'Data & IA', description: "Intègre LLM/vision/NLP dans des produits, évaluation et garde‑fous." },
  { title: 'Spécialiste Deep Learning', family: 'Data & IA', description: "Architectures neuronales avancées (vision, NLP, speech, reco)." },
  { title: 'Architecte Big Data', family: 'Data & IA', description: "Écosystèmes distribués (Spark, Kafka, Lakehouse) et gouvernance." },
  { title: 'Ingénieur NLP (Traitement du Langage Naturel)', family: 'Data & IA', description: "Pipelines NLP, fine‑tuning et évaluation linguistique." },
  { title: 'Statisticien Informatique', family: 'Data & IA', description: "Méthodes statistiques et expérimentation pour la modélisation." },
  { title: 'Analyste BI (Business Intelligence)', family: 'Data & IA', description: "Modélise entrepôts, crée rapports/dashboards (Power BI, Looker, Tableau)." },

  // Design & UX
  { title: 'UX Designer', family: 'Design & Expérience Utilisateur', description: "Recherche, parcours, wireframes, prototypage et tests utilisateurs." },
  { title: 'UI Designer', family: 'Design & Expérience Utilisateur', description: "Interfaces graphiques, design system et assets conformes à la brand." },
  { title: 'Product Designer', family: 'Design & Expérience Utilisateur', description: "Combine UX/UI pour concevoir des produits centrés utilisateur." },
  { title: 'Web Designer', family: 'Design & Expérience Utilisateur', description: "Identité visuelle et maquettes web selon contraintes techniques." },
  { title: 'Graphiste Digital', family: 'Design & Expérience Utilisateur', description: "Visuels et contenus digitaux pour web/social/marketing." },
  { title: 'Motion Designer', family: 'Design & Expérience Utilisateur', description: "Animations et micro‑interactions pour interfaces et contenus vidéo." },
  { title: 'Intégrateur UX / UI', family: 'Design & Expérience Utilisateur', description: "Traduit maquettes en composants front accessibles et cohérents." },
  { title: 'Designer 3D / Réalité Virtuelle', family: 'Design & Expérience Utilisateur', description: "Scènes 3D/VR/AR pour produits, jeux ou simulations." },

  // Gestion & Produit
  { title: 'Chef de Projet Informatique', family: 'Gestion, Produit & Méthodologie', description: "Planifie, coordonne et livre des projets IT (coûts/délais/qualité)." },
  { title: 'Scrum Master', family: 'Gestion, Produit & Méthodologie', description: "Facilite l’équipe agile, retire obstacles et améliore le processus Scrum." },
  { title: 'Product Owner', family: 'Gestion, Produit & Méthodologie', description: "Porte la vision produit, priorise le backlog et maximise la valeur." },
  { title: 'Product Manager', family: 'Gestion, Produit & Méthodologie', description: "Stratégie produit, roadmap et mesure d’impact business/UX." },
  { title: 'Business Analyst', family: 'Gestion, Produit & Méthodologie', description: "Recueil des besoins, specs fonctionnelles et alignement métier." },
  { title: 'IT Consultant / Consultant en SI', family: 'Gestion, Produit & Méthodologie', description: "Urbanisation SI, transformation digitale et choix de solutions." },
  { title: 'PMO (Project Management Officer)', family: 'Gestion, Produit & Méthodologie', description: "Gouvernance projets, suivi budgets/risques et portefeuille." },
  { title: 'CTO (Directeur Technique)', family: 'Gestion, Produit & Méthodologie', description: "Stratégie technologique, architecture et delivery d’ingénierie." },
  { title: 'CPO (Directeur Produit)', family: 'Gestion, Produit & Méthodologie', description: "Vision produit, orga PM/Design et alignement stratégique." },
  { title: 'Ingénieur Méthodes et Outils', family: 'Gestion, Produit & Méthodologie', description: "Outillage, normes et pratiques (revues, qualité, sécurité)." },
  { title: 'Architecte SI (Systèmes d’Information)', family: 'Gestion, Produit & Méthodologie', description: "Architecture d’entreprise : applicative, données et technique." },

  // Support & Maintenance
  { title: 'Technicien Support Applicatif', family: 'Support & Maintenance', description: "Support applicatif, analyse logs et reproduction d’incidents." },
  { title: 'Technicien Helpdesk', family: 'Support & Maintenance', description: "Point d’entrée du support, traitement des tickets et escalade." },
  { title: 'Technicien Maintenance Informatique', family: 'Support & Maintenance', description: "Diagnostic/réparation matériel, installation logiciels et gestion de parc." },
  { title: 'Responsable Support Utilisateur', family: 'Support & Maintenance', description: "Supervise support, définit SLA/process et satisfaction interne." },
  { title: 'Formateur Informatique', family: 'Support & Maintenance', description: "Conçoit et anime des formations logicielles, bureautiques ou techniques." },
  { title: 'Administrateur ITSM / GLPI / ServiceNow', family: 'Support & Maintenance', description: "Paramétrage plateforme ITSM, workflows, CMDB et catalogue." },

  // Hardware, IoT & Embarqués
  { title: 'Ingénieur Électronique', family: 'Hardware, IoT & Embarqués', description: "Conçoit circuits, PCB et valide via tests/mesures." },
  { title: 'Ingénieur Systèmes Embarqués', family: 'Hardware, IoT & Embarqués', description: "Logiciels temps réel/embarqué, drivers et intégration matériel‑logiciel." },
  { title: 'Développeur IoT', family: 'Hardware, IoT & Embarqués', description: "Objets connectés, protocoles (MQTT, BLE) et plateformes cloud IoT." },
  { title: 'Ingénieur Robotique', family: 'Hardware, IoT & Embarqués', description: "Contrôle/commande, perception et planification robotique." },
  { title: 'Technicien Réseaux Industriels', family: 'Hardware, IoT & Embarqués', description: "Réseaux OT/industriels (Modbus, Profinet) et sécurité OT." },
  { title: 'Développeur Firmware', family: 'Hardware, IoT & Embarqués', description: "Microcontrôleurs/SoC en C/C++, contraintes mémoire/énergie." },
  { title: 'Ingénieur Hardware', family: 'Hardware, IoT & Embarqués', description: "Conçoit/valide matériel informatique, protos et conformité." },

  // Spécialisations & Transverse
  { title: 'Ingénieur R&D', family: 'Spécialisations & Transverse', description: "Travaux d’innovation, prototypes et POC pour nouvelles solutions." },
  { title: 'Consultant ERP (SAP, Oracle, etc.)', family: 'Spécialisations & Transverse', description: "Paramètre, intègre et personnalise ERP pour processus clés." },
  { title: 'Analyste Fonctionnel', family: 'Spécialisations & Transverse', description: "Lien business‑technique, specs fonctionnelles et cas de test." },
  { title: 'Ingénieur de Production', family: 'Spécialisations & Transverse', description: "Supervise exploitation applicative, déploiements et performances prod." },
  { title: 'Administrateur Sécurité', family: 'Spécialisations & Transverse', description: "Administre IAM, politiques et solutions de protection." },
  { title: 'Ingénieur Observabilité / Monitoring', family: 'Spécialisations & Transverse', description: "Logs, métriques, traces et alerting pour fiabilité des services." },
  { title: 'Architecte d’Entreprise', family: 'Spécialisations & Transverse', description: "Aligne stratégie, processus et systèmes via cartographies/standards." },
  { title: 'Technicien Télécoms', family: 'Spécialisations & Transverse', description: "Infrastructures télécoms (VoIP, 4G/5G, fibre, PBX)." },
  { title: 'Ingénieur Plateforme (Platform Engineer)', family: 'Spécialisations & Transverse', description: "Construit des plateformes internes (PaaS) pour accélérer le delivery." },
  { title: 'Site Reliability Engineer (SRE)', family: 'Spécialisations & Transverse', description: "Fiabilité/disponibilité via SLO/SLA, automatisation et réduction du toil." },
  { title: 'Ingénieur MLOps', family: 'Spécialisations & Transverse', description: "Workflows ML : features, entraînement, déploiement, monitoring et drift." },
  { title: 'Ingénieur DataOps', family: 'Spécialisations & Transverse', description: "Livraison de pipelines et qualité data avec CI/CD/observabilité." },
  { title: 'Ingénieur Sécurité Applicative (AppSec)', family: 'Spécialisations & Transverse', description: "SAST/DAST, threat modeling et bonnes pratiques secure coding." },
  { title: 'Ingénieur FinOps', family: 'Spécialisations & Transverse', description: "Optimisation des coûts cloud et gouvernance budgétaire." },
  { title: 'Ingénieur QA Performance', family: 'Spécialisations & Transverse', description: "Tests de charge/stress/endurance, analyse des goulots et tuning." },
  { title: 'Ingénieur Virtualisation / Containers', family: 'Spécialisations & Transverse', description: "Infras virtualisées et conteneurisées à grande échelle." },
  { title: 'Data Steward', family: 'Spécialisations & Transverse', description: "Qualité, documentation et règles d’usage des données (catalogue, glossaire)." },
  { title: 'Data Product Manager', family: 'Spécialisations & Transverse', description: "Pilote produits data (datasets, features, APIs) et leur adoption." },
  { title: 'Ingénieur Sécurité Offensive (Red Team)', family: 'Spécialisations & Transverse', description: "Simule attaques avancées pour tester détection et réponse." },
  { title: 'Ingénieur Sécurité Défensive (Blue Team)', family: 'Spécialisations & Transverse', description: "Défense : détection, threat hunting et amélioration continue." },
  { title: 'Ingénieur Réponse à Incident', family: 'Spécialisations & Transverse', description: "Coordonne investigation, remédiation et communications d’incident." },
  { title: 'Architecte Data', family: 'Spécialisations & Transverse', description: "Modèles, flux et plateformes data (OLTP/OLAP, streaming, gouvernance)." },
  { title: 'Ingénieur Réseaux Cloud', family: 'Spécialisations & Transverse', description: "Réseaux hybrides, VPC/VNET, interconnexions et sécurité L3/L7 cloud." },
  { title: 'Ingénieur Tests E2E', family: 'Spécialisations & Transverse', description: "Automatise scénarios bout‑en‑bout et stabilise les suites." },
  { title: 'Ingénieur Release / Build', family: 'Spécialisations & Transverse', description: "Packaging, versioning, branches et publication CI/CD." },
  { title: 'Ingénieur Observabilité Front-End', family: 'Spécialisations & Transverse', description: "RUM, Core Web Vitals et suivi des erreurs côté client." },
  { title: 'Technical Writer', family: 'Spécialisations & Transverse', description: "Documentations techniques et guides API clairs et à jour." },
  { title: 'Ingénieur Accessibilité (a11y)', family: 'Spécialisations & Transverse', description: "Audite et améliore l’accessibilité (WCAG/ARIA)." },
  { title: 'Ingénieur Sécurité Mobile', family: 'Spécialisations & Transverse', description: "Sécurité des apps mobiles, SDK et chaîne de build." },
  { title: 'Architecte Microservices', family: 'Spécialisations & Transverse', description: "Systèmes distribués, patterns de communication et observabilité." },
  { title: 'Release Train Engineer (RTE)', family: 'Spécialisations & Transverse', description: "Coordonne ARTs (SAFe), synchronise PI Planning et dépendances." },
  { title: 'Ingénieur Edge / CDN', family: 'Spécialisations & Transverse', description: "Optimise delivery via CDN/edge compute, caching, routing et sécurité." },
  { title: 'Ingénieur Sécurité des Données', family: 'Spécialisations & Transverse', description: "Chiffrement, masquage, DLP et contrôle d’accès aux données." },
  { title: 'Consultant Gouvernance Data', family: 'Spécialisations & Transverse', description: "Politiques, rôles et processus pour maîtriser l’usage des données." },
  { title: 'Ingénieur Tests Mobile', family: 'Spécialisations & Transverse', description: "Tests mobiles (UI, intégration, performance) sur devices réels/émulateurs." },
  { title: 'Ingénieur Scalabilité', family: 'Spécialisations & Transverse', description: "Dimensionne et optimise architectures pour forte charge." },
  { title: 'Ingénieur Sécurité DevSecOps', family: 'Spécialisations & Transverse', description: "Contrôles sécurité dans pipelines CI/CD et supply chain logicielle." },
  { title: 'Ingénieur Réalité Étendue (XR)', family: 'Spécialisations & Transverse', description: "Expériences AR/VR/MR, rendu et interactions immersives." },
  { title: 'Ingénieur Data Visualization', family: 'Spécialisations & Transverse', description: "Visualisations, storytelling et composants graphiques utiles." },
  { title: 'Analyste Produit (Product Analytics)', family: 'Spécialisations & Transverse', description: "Mesure usage produit, A/B testing et leviers d’amélioration." },
  { title: 'Responsable Qualité Logicielle', family: 'Spécialisations & Transverse', description: "Stratégie qualité, métriques et amélioration continue." },
  { title: 'Ingénieur API Management', family: 'Spécialisations & Transverse', description: "Portails, passerelles, sécurité et monitoring des APIs." },
  { title: 'Spécialiste RPA (Automatisation Robotique)', family: 'Spécialisations & Transverse', description: "Automatise des processus métiers avec des robots logiciels." },
  { title: 'Consultant CRM (Salesforce, Dynamics)', family: 'Spécialisations & Transverse', description: "Paramètre/intègre/étend des CRM pour vente/marketing/service." },
]

async function main() {
  // Purge pour éviter doublons (respect des FK)
  await prisma.$transaction([
    prisma.job.deleteMany({}),
    prisma.jobFamily.deleteMany({}),
  ])

  // Création des familles (upsert par name pour idempotence si unique existe)
  const familyMap = new Map<FamilyName, string>()
  for (const f of jobFamilies) {
    const created = await prisma.jobFamily.create({ data: { name: f.name } })
    familyMap.set(f.name, created.id)
  }

  // Insertion des jobs reliés à leur famille
  // createMany est plus rapide mais ne remonte pas les ids créés → on construit les objets puis on insère en batch
  const jobRows = jobs.map((j) => ({
    title: j.title,
    description: j.description,
    jobFamilyId: familyMap.get(j.family)!,
  }))

  await prisma.job.createMany({ data: jobRows })

  console.log(`✔︎ Seed terminé : ${jobRows.length} jobs dans ${jobFamilies.length} familles.`)
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
