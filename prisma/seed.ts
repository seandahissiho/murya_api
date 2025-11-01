import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// --------------------------------------------------
// Utils
// --------------------------------------------------
function normalizeName(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
}

// --------------------------------------------------
// Job Families (top-level only)
// --------------------------------------------------
const jobFamilies = [
    'Développement & Programmation',
    'Cloud & Infrastructure',
    'Cybersécurité',
    'Data & IA',
    'Design & Expérience Utilisateur',
    'Gestion, Produit & Méthodologie',
    'Support & Maintenance',
    'Hardware, IoT & Embarqués',
    'Spécialisations & Transverse',
] as const

type FamilyName = typeof jobFamilies[number]

// --------------------------------------------------
// Competency Families (Savoir-faire / Savoir-être)
// --------------------------------------------------
const competencyFamilies = [
    { name: 'Savoir-faire', description: 'Capacités pratiques et méthodologiques (process, patterns, méthodes, livrables).' },
    { name: 'Savoir-être', description: 'Comportements et attitudes professionnelles (soft skills).' },
] as const

type CompFamilyKey = typeof competencyFamilies[number]['name']

// --------------------------------------------------
// Competencies (difficulty 1..4)
// --------------------------------------------------
const competenciesSeed: { name: string; level: 1|2|3|4; family: CompFamilyKey }[] = [
    // Savoir-faire (merged from original Savoir and Savoir-faire)
    { name: 'HTML', level: 1, family: 'Savoir-faire' },
    { name: 'CSS', level: 1, family: 'Savoir-faire' },
    { name: 'JavaScript', level: 2, family: 'Savoir-faire' },
    { name: 'TypeScript', level: 2, family: 'Savoir-faire' },
    { name: 'React', level: 2, family: 'Savoir-faire' },
    { name: 'Vue.js', level: 2, family: 'Savoir-faire' },
    { name: 'Angular', level: 3, family: 'Savoir-faire' },
    { name: 'Next.js', level: 2, family: 'Savoir-faire' },
    { name: 'Node.js', level: 2, family: 'Savoir-faire' },
    { name: 'Express', level: 2, family: 'Savoir-faire' },
    { name: 'NestJS', level: 3, family: 'Savoir-faire' },
    { name: 'Python', level: 2, family: 'Savoir-faire' },
    { name: 'Django', level: 2, family: 'Savoir-faire' },
    { name: 'FastAPI', level: 2, family: 'Savoir-faire' },
    { name: 'Java', level: 2, family: 'Savoir-faire' },
    { name: 'Spring', level: 3, family: 'Savoir-faire' },
    { name: 'C#', level: 2, family: 'Savoir-faire' },
    { name: '.NET', level: 3, family: 'Savoir-faire' },
    { name: 'PHP', level: 2, family: 'Savoir-faire' },
    { name: 'Laravel', level: 2, family: 'Savoir-faire' },
    { name: 'Symfony', level: 3, family: 'Savoir-faire' },
    { name: 'Go', level: 3, family: 'Savoir-faire' },
    { name: 'Rust', level: 4, family: 'Savoir-faire' },
    { name: 'Swift', level: 2, family: 'Savoir-faire' },
    { name: 'Kotlin', level: 2, family: 'Savoir-faire' },
    { name: 'Flutter', level: 2, family: 'Savoir-faire' },
    { name: 'React Native', level: 2, family: 'Savoir-faire' },
    { name: 'Unity', level: 3, family: 'Savoir-faire' },
    { name: 'Unreal Engine', level: 4, family: 'Savoir-faire' },
    { name: 'WordPress', level: 1, family: 'Savoir-faire' },
    { name: 'Drupal', level: 3, family: 'Savoir-faire' },
    { name: 'PostgreSQL', level: 2, family: 'Savoir-faire' },
    { name: 'MySQL', level: 1, family: 'Savoir-faire' },
    { name: 'SQL Server', level: 2, family: 'Savoir-faire' },
    { name: 'Oracle DB', level: 3, family: 'Savoir-faire' },
    { name: 'MongoDB', level: 2, family: 'Savoir-faire' },
    { name: 'Redis', level: 2, family: 'Savoir-faire' },
    { name: 'Kafka', level: 3, family: 'Savoir-faire' },
    { name: 'Apache Spark', level: 3, family: 'Savoir-faire' },
    { name: 'Airflow', level: 3, family: 'Savoir-faire' },
    { name: 'Docker', level: 2, family: 'Savoir-faire' },
    { name: 'Kubernetes', level: 4, family: 'Savoir-faire' },
    { name: 'Terraform', level: 3, family: 'Savoir-faire' },
    { name: 'Ansible', level: 2, family: 'Savoir-faire' },
    { name: 'Linux', level: 2, family: 'Savoir-faire' },
    { name: 'Windows Server', level: 2, family: 'Savoir-faire' },
    { name: 'AWS', level: 3, family: 'Savoir-faire' },
    { name: 'Azure', level: 3, family: 'Savoir-faire' },
    { name: 'GCP', level: 3, family: 'Savoir-faire' },
    { name: 'NGINX', level: 2, family: 'Savoir-faire' },
    { name: 'Grafana', level: 2, family: 'Savoir-faire' },
    { name: 'Prometheus', level: 3, family: 'Savoir-faire' },
    { name: 'Git', level: 1, family: 'Savoir-faire' },
    { name: 'CI/CD', level: 2, family: 'Savoir-faire' },
    { name: 'Power BI', level: 2, family: 'Savoir-faire' },
    { name: 'Tableau', level: 2, family: 'Savoir-faire' },
    { name: 'Looker', level: 2, family: 'Savoir-faire' },
    { name: 'TensorFlow', level: 3, family: 'Savoir-faire' },
    { name: 'PyTorch', level: 3, family: 'Savoir-faire' },
    { name: 'NLP', level: 3, family: 'Savoir-faire' },
    { name: 'Computer Vision', level: 3, family: 'Savoir-faire' },
    { name: 'Web Security (OWASP)', level: 2, family: 'Savoir-faire' },
    { name: 'SIEM', level: 3, family: 'Savoir-faire' },
    { name: 'EDR', level: 3, family: 'Savoir-faire' },
    { name: 'IAM', level: 3, family: 'Savoir-faire' },
    { name: 'ServiceNow', level: 2, family: 'Savoir-faire' },
    { name: 'GLPI', level: 1, family: 'Savoir-faire' },
    { name: 'VMware vSphere', level: 3, family: 'Savoir-faire' },
    { name: 'Hyper-V', level: 2, family: 'Savoir-faire' },
    { name: 'MQTT', level: 2, family: 'Savoir-faire' },
    { name: 'BLE', level: 2, family: 'Savoir-faire' },
    { name: 'C (embarqué)', level: 3, family: 'Savoir-faire' },
    { name: 'C++ (embarqué)', level: 3, family: 'Savoir-faire' },
    { name: 'Architecture Microservices', level: 3, family: 'Savoir-faire' },
    { name: 'Conception d’API REST', level: 2, family: 'Savoir-faire' },
    { name: 'Conception d’API GraphQL', level: 3, family: 'Savoir-faire' },
    { name: 'Conception Base de Données', level: 2, family: 'Savoir-faire' },
    { name: 'Caching & Performance Web', level: 3, family: 'Savoir-faire' },
    { name: 'TDD (Test-Driven Development)', level: 3, family: 'Savoir-faire' },
    { name: 'Tests E2E', level: 2, family: 'Savoir-faire' },
    { name: 'Observabilité (logs/métriques/traces)', level: 3, family: 'Savoir-faire' },
    { name: 'SRE (SLO/SLA/SLI)', level: 4, family: 'Savoir-faire' },
    { name: 'Incident Response', level: 3, family: 'Savoir-faire' },
    { name: 'Threat Modeling', level: 3, family: 'Savoir-faire' },
    { name: 'Pentest', level: 3, family: 'Savoir-faire' },
    { name: 'Data Modeling (OLTP/OLAP)', level: 3, family: 'Savoir-faire' },
    { name: 'ETL/ELT', level: 2, family: 'Savoir-faire' },
    { name: 'ML Ops (déploiement/monitoring)', level: 3, family: 'Savoir-faire' },
    { name: 'Feature Engineering', level: 3, family: 'Savoir-faire' },
    { name: 'A/B Testing', level: 2, family: 'Savoir-faire' },
    { name: 'Design System', level: 2, family: 'Savoir-faire' },
    { name: 'UX Research', level: 2, family: 'Savoir-faire' },
    { name: 'Prod Monitoring', level: 2, family: 'Savoir-faire' },
    { name: 'CI/CD Pipeline Design', level: 3, family: 'Savoir-faire' },
    { name: 'Infrastructure as Code', level: 3, family: 'Savoir-faire' },
    { name: 'Cloud Costing (FinOps)', level: 3, family: 'Savoir-faire' },
    { name: 'ITIL / ITSM', level: 2, family: 'Savoir-faire' },
    { name: 'Gestion des Incidents', level: 2, family: 'Savoir-faire' },
    { name: 'Roadmapping Produit', level: 2, family: 'Savoir-faire' },
    { name: 'Scrum', level: 2, family: 'Savoir-faire' },
    { name: 'Kanban', level: 1, family: 'Savoir-faire' },
    { name: 'Value Stream Mapping', level: 3, family: 'Savoir-faire' },
    { name: 'Sécurité by Design', level: 3, family: 'Savoir-faire' },

    // Savoir-être
    { name: 'Communication', level: 2, family: 'Savoir-être' },
    { name: 'Esprit d’équipe', level: 2, family: 'Savoir-être' },
    { name: 'Rigueur', level: 2, family: 'Savoir-être' },
    { name: 'Autonomie', level: 2, family: 'Savoir-être' },
    { name: 'Leadership', level: 3, family: 'Savoir-être' },
    { name: 'Résolution de problèmes', level: 3, family: 'Savoir-être' },
    { name: 'Gestion du temps', level: 2, family: 'Savoir-être' },
    { name: 'Pédagogie', level: 2, family: 'Savoir-être' },
    { name: 'Créativité', level: 2, family: 'Savoir-être' },
    { name: 'Empathie', level: 2, family: 'Savoir-être' },
]

// --------------------------------------------------
// Jobs (subset with competency links)
// --------------------------------------------------
const jobs: { title: string; family: FamilyName; popularity: number; description: string; competencies: string[] }[] = [
    // -------------------------
    // Développement & Programmation
    // -------------------------
    { title: 'Développeur Front-End', family: 'Développement & Programmation', popularity: 95, description: 'Interfaces web accessibles et performantes.', competencies: ['HTML','CSS','JavaScript','TypeScript','React','Design System','Caching & Performance Web'] },
    { title: 'Développeur Back-End', family: 'Développement & Programmation', popularity: 95, description: 'APIs, logique serveur, sécurité et persistance.', competencies: ['Node.js','Express','NestJS','Java','Spring','.NET','PostgreSQL','MongoDB','Redis'] },
    { title: 'Développeur Full-Stack', family: 'Développement & Programmation', popularity: 98, description: 'Du front au back, du prototype à la prod.', competencies: ['React','Next.js','Node.js','PostgreSQL','CI/CD','Docker'] },
    { title: 'Développeur Mobile (iOS / Android)', family: 'Développement & Programmation', popularity: 92, description: 'Applications natives et intégration device.', competencies: ['Swift','Kotlin','Xcode','Android Studio','CI/CD'] },
    { title: 'Développeur Flutter', family: 'Développement & Programmation', popularity: 88, description: 'Apps cross-platform performantes avec Flutter/Dart.', competencies: ['Flutter','Dart','CI/CD','Testing'] },
    { title: 'Développeur React Native', family: 'Développement & Programmation', popularity: 86, description: 'Apps mobiles multiplateformes.', competencies: ['React Native','TypeScript','Expo','CI/CD'] },
    { title: 'Développeur Web', family: 'Développement & Programmation', popularity: 80, description: 'Sites et applications web complètes.', competencies: ['HTML','CSS','JavaScript','SEO technique','Accessibilité (a11y)'] },
    { title: 'Développeur Java', family: 'Développement & Programmation', popularity: 85, description: 'Services et APIs Java.', competencies: ['Java','Spring','Hibernate','Maven','JUnit'] },
    { title: 'Développeur Python', family: 'Développement & Programmation', popularity: 90, description: 'Backends, scripts et services data.', competencies: ['Python','Django','FastAPI','Pandas','SQL'] },
    { title: 'Développeur Node.js', family: 'Développement & Programmation', popularity: 90, description: 'APIs/microservices Node.', competencies: ['Node.js','NestJS','Express','TypeScript','Jest'] },
    { title: 'Développeur PHP / Laravel / Symfony', family: 'Développement & Programmation', popularity: 78, description: 'Apps web modernes en PHP.', competencies: ['PHP','Laravel','Symfony','MySQL','Redis'] },
    { title: 'Développeur .NET / C#', family: 'Développement & Programmation', popularity: 82, description: 'Services, APIs et apps web/desktop .NET.', competencies: ['C#','.NET','ASP.NET Core','EF Core','Azure'] },
    { title: 'Développeur C / C++', family: 'Développement & Programmation', popularity: 70, description: 'Logiciels système/embarqué haute performance.', competencies: ['C','C++','Linux','Multithreading','Optimisation'] },
    { title: 'Développeur Go (Golang)', family: 'Développement & Programmation', popularity: 75, description: 'Services concurrents et microservices.', competencies: ['Go','gRPC','Docker','Kubernetes'] },
    { title: 'Développeur Rust', family: 'Développement & Programmation', popularity: 65, description: 'Logiciels sûrs et rapides (systèmes/WASM).', competencies: ['Rust','Tokio','WASM','Actix'] },
    { title: 'Développeur Ruby on Rails', family: 'Développement & Programmation', popularity: 60, description: 'Applications web rapides à livrer.', competencies: ['Ruby','Ruby on Rails','PostgreSQL','RSpec'] },
    { title: 'Développeur Kotlin', family: 'Développement & Programmation', popularity: 77, description: 'Android et backends Kotlin.', competencies: ['Kotlin','Android','Ktor','Coroutines'] },
    { title: 'Développeur Swift', family: 'Développement & Programmation', popularity: 74, description: 'Apps iOS/iPadOS/macOS.', competencies: ['Swift','SwiftUI','UIKit','Combine'] },
    { title: 'Développeur Blockchain / Web3', family: 'Développement & Programmation', popularity: 55, description: 'dApps et intégrations on-chain.', competencies: ['Solidity','EVM','Web3.js','Hardhat'] },
    { title: 'Développeur Smart Contracts (Solidity)', family: 'Développement & Programmation', popularity: 52, description: 'Écriture et audit de smart contracts.', competencies: ['Solidity','Hardhat','Foundry','OWASP'] },
    { title: 'Développeur Game (Unity / Unreal Engine)', family: 'Développement & Programmation', popularity: 68, description: 'Gameplay, outils et rendu.', competencies: ['Unity','Unreal Engine','C#','C++','Shaders'] },
    { title: 'Intégrateur Web', family: 'Développement & Programmation', popularity: 73, description: 'Maquettes → pages web responsive.', competencies: ['HTML','CSS','Tailwind','Accessibilité (a11y)'] },
    { title: 'Développeur CMS (WordPress, Drupal, Joomla)', family: 'Développement & Programmation', popularity: 76, description: 'Implémentation et personnalisation de CMS.', competencies: ['WordPress','Drupal','PHP','SEO'] },
    { title: 'Ingénieur Logiciel', family: 'Développement & Programmation', popularity: 88, description: 'Conception et maintien de logiciels.', competencies: ['Conception OO','Patterns','Tests','CI/CD'] },
    { title: 'Architecte Logiciel', family: 'Développement & Programmation', popularity: 80, description: 'Architecture applicative & choix techniques.', competencies: ['Microservices','DDD','Event-Driven','Sécurité by Design'] },
    { title: 'Testeur QA / QA Engineer', family: 'Développement & Programmation', popularity: 72, description: 'Stratégie et exécution de tests.', competencies: ['Tests E2E','Cypress','Playwright','TDD'] },
    { title: 'Ingénieur en automatisation des tests', family: 'Développement & Programmation', popularity: 70, description: 'Frameworks de tests automatisés.', competencies: ['Selenium','Playwright','Cypress','CI/CD'] },
    { title: 'Ingénieur DevOps / CI-CD', family: 'Développement & Programmation', popularity: 90, description: 'Automatisation build/tests/déploiements.', competencies: ['CI/CD','Docker','Kubernetes','Terraform','Observabilité (logs/métriques/traces)'] },

    // -------------------------
    // Cloud & Infrastructure
    // -------------------------
    { title: 'Administrateur Systèmes et Réseaux', family: 'Cloud & Infrastructure', popularity: 85, description: 'Exploitation serveurs, réseaux et sécurité.', competencies: ['Linux','Windows Server','Réseaux (Routing/Switching)','Ansible'] },
    { title: 'Ingénieur Systèmes', family: 'Cloud & Infrastructure', popularity: 80, description: 'Plateformes Linux/Windows & HA.', competencies: ['Linux','Windows Server','VMware vSphere','PowerShell'] },
    { title: 'Ingénieur Réseaux', family: 'Cloud & Infrastructure', popularity: 80, description: 'LAN/WAN/Wi-Fi, routage et QoS.', competencies: ['BGP','OSPF','VLAN','Firewalling'] },
    { title: 'Architecte Cloud', family: 'Cloud & Infrastructure', popularity: 78, description: 'Conception d’architectures cloud.', competencies: ['AWS','Azure','GCP','Kubernetes','Terraform','FinOps'] },
    { title: 'Ingénieur Cloud (AWS, Azure, GCP)', family: 'Cloud & Infrastructure', popularity: 84, description: 'Implémentation services managés et IaC.', competencies: ['AWS','Azure','GCP','Terraform','Ansible','Linux'] },
    { title: 'Spécialiste Kubernetes / Docker', family: 'Cloud & Infrastructure', popularity: 82, description: 'Orchestration de conteneurs.', competencies: ['Docker','Kubernetes','Helm','NGINX','Prometheus','Grafana'] },
    { title: 'Ingénieur Infrastructure as Code (Terraform, Ansible)', family: 'Cloud & Infrastructure', popularity: 76, description: 'Provisionnement et configuration automatisés.', competencies: ['Terraform','Ansible','Packer','CI/CD'] },
    { title: 'Administrateur Base de Données (DBA)', family: 'Cloud & Infrastructure', popularity: 74, description: 'Disponibilité, performance et sécurité SGBD.', competencies: ['PostgreSQL','MySQL','Oracle DB','SQL Server','Backup/Restore'] },
    { title: 'Ingénieur Stockage / Virtualisation', family: 'Cloud & Infrastructure', popularity: 70, description: 'SAN/NAS, hyperviseurs et PRA.', competencies: ['VMware vSphere','Hyper-V','ZFS','iSCSI'] },
    { title: 'Technicien Informatique', family: 'Cloud & Infrastructure', popularity: 78, description: 'Installation, maintenance et dépannage.', competencies: ['Windows','Réseau','ITIL','Gestion des Incidents'] },
    { title: 'Technicien Support N1 / N2 / N3', family: 'Cloud & Infrastructure', popularity: 80, description: 'Support multi-niveaux & escalade.', competencies: ['ITIL','GLPI','ServiceNow','Diagnostic'] },
    { title: 'Responsable IT / IT Manager', family: 'Cloud & Infrastructure', popularity: 72, description: 'Pilotage équipes, budgets et SLA.', competencies: ['SLA','Planification','Sécurité','Fournisseurs'] },

    // -------------------------
    // Cybersécurité
    // -------------------------
    { title: 'Analyste en Cybersécurité', family: 'Cybersécurité', popularity: 82, description: 'Surveillance et détection des menaces.', competencies: ['SIEM','EDR','Web Security (OWASP)','Incident Response'] },
    { title: 'Ingénieur Sécurité', family: 'Cybersécurité', popularity: 78, description: 'Déploiement de contrôles & hardening.', competencies: ['IAM','EDR','Firewalling','Vulnerability Management'] },
    { title: 'Pentester (Test d’intrusion)', family: 'Cybersécurité', popularity: 68, description: 'Audits offensifs et remédiation.', competencies: ['Pentest','OWASP','Burp Suite','Threat Modeling'] },
    { title: 'Expert en Sécurité Réseau', family: 'Cybersécurité', popularity: 66, description: 'Sécurité périmétrique & segmentation.', competencies: ['Firewalls','VPN','IDS/IPS','Zero Trust'] },
    { title: 'RSSI (Responsable Sécurité des Systèmes d’Information)', family: 'Cybersécurité', popularity: 60, description: 'Gouvernance, conformité et gestion de crise.', competencies: ['ISO 27001','RGPD','Gestion des risques','PSSI'] },
    { title: 'Consultant Sécurité', family: 'Cybersécurité', popularity: 64, description: 'Politiques, normes et audits.', competencies: ['ISO 27001','NIST','Audit','Awareness'] },
    { title: 'Analyste SOC', family: 'Cybersécurité', popularity: 70, description: 'Détection et réponse en temps réel.', competencies: ['SIEM','EDR','Playbooks','Threat Hunting'] },
    { title: 'Architecte Sécurité', family: 'Cybersécurité', popularity: 62, description: 'Architecture sécurisée app/cloud.', competencies: ['Sécurité by Design','IAM','PKI','Segmentation'] },
    { title: 'Spécialiste Forensic / Investigation numérique', family: 'Cybersécurité', popularity: 55, description: 'Collecte et analyse de preuves.', competencies: ['Forensic','Chain of Custody','eDiscovery','Logs'] },
    { title: 'Expert en Sécurité Cloud', family: 'Cybersécurité', popularity: 66, description: 'Sécurité spécifique aux environnements cloud.', competencies: ['CSPM','CIEM','KMS','IAM'] },

    // -------------------------
    // Data & Intelligence Artificielle
    // -------------------------
    { title: 'Data Analyst', family: 'Data & IA', popularity: 85, description: 'Exploration, KPIs et dashboards.', competencies: ['SQL','Power BI','Tableau','Looker'] },
    { title: 'Data Scientist', family: 'Data & IA', popularity: 80, description: 'Modélisation statistique/ML.', competencies: ['Python','Pandas','Scikit-learn','TensorFlow','PyTorch'] },
    { title: 'Data Engineer', family: 'Data & IA', popularity: 86, description: 'Pipelines et fiabilité des données.', competencies: ['Airflow','Apache Spark','Kafka','DBT','ETL/ELT'] },
    { title: 'Machine Learning Engineer', family: 'Data & IA', popularity: 78, description: 'Déploiement/monitoring de modèles.', competencies: ['ML Ops (déploiement/monitoring)','TensorFlow','PyTorch','Docker'] },
    { title: 'AI Engineer / Ingénieur en IA', family: 'Data & IA', popularity: 74, description: 'Intégration LLM/vision/NLP.', competencies: ['NLP','Prompting','Vector DB','Evaluation'] },
    { title: 'Spécialiste Deep Learning', family: 'Data & IA', popularity: 60, description: 'Architectures neuronales avancées.', competencies: ['CNN','RNN','Transformers','GPU'] },
    { title: 'Architecte Big Data', family: 'Data & IA', popularity: 62, description: 'Écosystèmes distribués & gouvernance.', competencies: ['Lakehouse','Spark','Kafka','Delta/Iceberg'] },
    { title: 'Ingénieur NLP (Traitement du Langage Naturel)', family: 'Data & IA', popularity: 58, description: 'Pipelines NLP et évaluation.', competencies: ['Tokenization','Fine-tuning','Embeddings','Evaluation'] },
    { title: 'Statisticien Informatique', family: 'Data & IA', popularity: 50, description: 'Méthodes statistiques & expérimentation.', competencies: ['Statistiques','A/B Testing','R','Python'] },
    { title: 'Analyste BI (Business Intelligence)', family: 'Data & IA', popularity: 76, description: 'Modélisation et reporting BI.', competencies: ['SQL','Power BI','Tableau','Modélisation en étoile'] },

    // -------------------------
    // Design & Expérience Utilisateur
    // -------------------------
    { title: 'UX Designer', family: 'Design & Expérience Utilisateur', popularity: 78, description: 'Recherche, parcours et tests.', competencies: ['UX Research','Prototypage','Tests utilisateurs','Accessibilité (a11y)'] },
    { title: 'UI Designer', family: 'Design & Expérience Utilisateur', popularity: 74, description: 'Interfaces et design system.', competencies: ['Figma','Design System','Prototypage','HIG/Material'] },
    { title: 'Product Designer', family: 'Design & Expérience Utilisateur', popularity: 70, description: 'Conception end-to-end centrée utilisateur.', competencies: ['UX','UI','Prototypage','A/B Testing'] },
    { title: 'Web Designer', family: 'Design & Expérience Utilisateur', popularity: 60, description: 'Identité visuelle et maquettes web.', competencies: ['Figma','Branding','Responsive','Motion légère'] },
    { title: 'Graphiste Digital', family: 'Design & Expérience Utilisateur', popularity: 62, description: 'Création de visuels pour le digital.', competencies: ['Suite Adobe','Illustration','Typographie','Motion'] },
    { title: 'Motion Designer', family: 'Design & Expérience Utilisateur', popularity: 66, description: 'Animations et micro-interactions.', competencies: ['After Effects','Lottie','Storyboarding','Timing'] },
    { title: 'Intégrateur UX / UI', family: 'Design & Expérience Utilisateur', popularity: 68, description: 'Maquettes → composants front.', competencies: ['HTML','CSS','React','Accessibilité (a11y)'] },
    { title: 'Designer 3D / Réalité Virtuelle', family: 'Design & Expérience Utilisateur', popularity: 58, description: 'Scènes 3D/VR/AR.', competencies: ['3D','Unity','Unreal','Optimisation'] },

    // -------------------------
    // Gestion, Produit & Méthodologie
    // -------------------------
    { title: 'Chef de Projet Informatique', family: 'Gestion, Produit & Méthodologie', popularity: 82, description: 'Planification et delivery projet.', competencies: ['Planification','Budget','Risques','Scrum','Kanban'] },
    { title: 'Scrum Master', family: 'Gestion, Produit & Méthodologie', popularity: 72, description: 'Facilitation agile & amélioration continue.', competencies: ['Scrum','Kanban','Coaching','Rétrospectives'] },
    { title: 'Product Owner', family: 'Gestion, Produit & Méthodologie', popularity: 78, description: 'Vision produit & backlog.', competencies: ['Backlog','User Stories','Priorisation','Découverte'] },
    { title: 'Product Manager', family: 'Gestion, Produit & Méthodologie', popularity: 76, description: 'Stratégie, roadmap et impact.', competencies: ['Roadmapping','Discovery','Analytics','A/B Testing'] },
    { title: 'Business Analyst', family: 'Gestion, Produit & Méthodologie', popularity: 74, description: 'Spécifications et alignement métier.', competencies: ['Recueil besoins','UML/BPMN','Cas d’utilisation','Tests'] },
    { title: 'IT Consultant / Consultant en SI', family: 'Gestion, Produit & Méthodologie', popularity: 70, description: 'Urbanisation et choix de solutions.', competencies: ['Audit','Architecture SI','Cadrage','Change'] },
    { title: 'PMO (Project Management Officer)', family: 'Gestion, Produit & Méthodologie', popularity: 66, description: 'Gouvernance portefeuille projets.', competencies: ['Pilotage','KPI','Capacité','Risques'] },
    { title: 'CTO (Directeur Technique)', family: 'Gestion, Produit & Méthodologie', popularity: 64, description: 'Stratégie technologique et delivery.', competencies: ['Architecture','Organisation','Sécurité','Budget'] },
    { title: 'CPO (Directeur Produit)', family: 'Gestion, Produit & Méthodologie', popularity: 60, description: 'Vision produit et orga PM/Design.', competencies: ['Strategy','Leadership','OKR','Alignment'] },
    { title: 'Ingénieur Méthodes et Outils', family: 'Gestion, Produit & Méthodologie', popularity: 62, description: 'Outillage, normes et pratiques.', competencies: ['Qualité','CI/CD','Sécurité','Observabilité'] },
    { title: 'Architecte SI (Systèmes d’Information)', family: 'Gestion, Produit & Méthodologie', popularity: 66, description: 'Architecture d’entreprise transverse.', competencies: ['Cartographie','Gouvernance','Interopérabilité','Sécurité'] },

    // -------------------------
    // Support, Maintenance & Assistance
    // -------------------------
    { title: 'Technicien Support Applicatif', family: 'Support & Maintenance', popularity: 72, description: 'Support niveau applicatif.', competencies: ['Analyse logs','Reproduction incidents','SQL','ITIL'] },
    { title: 'Technicien Helpdesk', family: 'Support & Maintenance', popularity: 70, description: 'Point d’entrée support & tickets.', competencies: ['GLPI','ServiceNow','Diagnostic','ITIL'] },
    { title: 'Technicien Maintenance Informatique', family: 'Support & Maintenance', popularity: 66, description: 'Dépannage matériel & logiciels.', competencies: ['Hardware','OS','Imagerie','Inventaire'] },
    { title: 'Responsable Support Utilisateur', family: 'Support & Maintenance', popularity: 64, description: 'Management support & SLA.', competencies: ['SLA','Satisfaction','Process','Reporting'] },
    { title: 'Formateur Informatique', family: 'Support & Maintenance', popularity: 60, description: 'Conception et animation de formations.', competencies: ['Pédagogie','Conception pédagogique','Bureautique','Logiciels'] },
    { title: 'Administrateur ITSM / GLPI / ServiceNow', family: 'Support & Maintenance', popularity: 62, description: 'Paramétrage plateforme ITSM.', competencies: ['ITIL','CMDB','Workflows','Catalogue'] },

    // -------------------------
    // Hardware, IoT & Systèmes Embarqués
    // -------------------------
    { title: 'Ingénieur Électronique', family: 'Hardware, IoT & Embarqués', popularity: 62, description: 'Conception de circuits et PCB.', competencies: ['Schémas','PCB','Mesures','Normes'] },
    { title: 'Ingénieur Systèmes Embarqués', family: 'Hardware, IoT & Embarqués', popularity: 70, description: 'Logiciels temps réel/embarqué.', competencies: ['C (embarqué)','C++ (embarqué)','RTOS','Drivers'] },
    { title: 'Développeur IoT', family: 'Hardware, IoT & Embarqués', popularity: 68, description: 'Objets connectés et passerelles.', competencies: ['MQTT','BLE','IoT Cloud','Sécurité IoT'] },
    { title: 'Ingénieur Robotique', family: 'Hardware, IoT & Embarqués', popularity: 60, description: 'Contrôle/commande et perception.', competencies: ['ROS','Vision','Planification','C++'] },
    { title: 'Technicien Réseaux Industriels', family: 'Hardware, IoT & Embarqués', popularity: 58, description: 'Réseaux OT/industriels.', competencies: ['Modbus','Profinet','Sécurité OT','Diagnostics'] },
    { title: 'Développeur Firmware', family: 'Hardware, IoT & Embarqués', popularity: 64, description: 'Microcontrôleurs/SoC et drivers.', competencies: ['C','C++','Bare-metal','Debug'] },
    { title: 'Ingénieur Hardware', family: 'Hardware, IoT & Embarqués', popularity: 56, description: 'Conception et validation matériel.', competencies: ['Schémas','PCB','Prototype','Tests de conformité'] },

    // -------------------------
    // Spécialisations & Transverse
    // -------------------------
    { title: 'Ingénieur R&D', family: 'Spécialisations & Transverse', popularity: 60, description: 'Innovation, POC et prototypage.', competencies: ['Exploration','Prototypage','Mesure','Doc'] },
    { title: 'Consultant ERP (SAP, Oracle, etc.)', family: 'Spécialisations & Transverse', popularity: 66, description: 'Paramétrage et intégration ERP.', competencies: ['SAP','Oracle ERP','Processus métier','SQL'] },
    { title: 'Analyste Fonctionnel', family: 'Spécialisations & Transverse', popularity: 64, description: 'Lien business-technique & specs.', competencies: ['Workshops','Spécifications','Recette','UML/BPMN'] },
    { title: 'Ingénieur de Production', family: 'Spécialisations & Transverse', popularity: 68, description: 'Exploitation applicative & MEP.', competencies: ['Runbooks','Ordonnancement','Supervision','Capacité'] },
    { title: 'Administrateur Sécurité', family: 'Spécialisations & Transverse', popularity: 62, description: 'Identités, accès et politiques.', competencies: ['IAM','PAM','MFA','Politiques'] },
    { title: 'Ingénieur Observabilité / Monitoring', family: 'Spécialisations & Transverse', popularity: 66, description: 'Logs, métriques, traces & alerting.', competencies: ['Prometheus','Grafana','OpenTelemetry','SLO/SLI'] },
    { title: 'Architecte d’Entreprise', family: 'Spécialisations & Transverse', popularity: 62, description: 'Alignement stratégie/process/systèmes.', competencies: ['TOGAF','Cartographie','Standards','Roadmap'] },
    { title: 'Technicien Télécoms', family: 'Spécialisations & Transverse', popularity: 58, description: 'VoIP, 4G/5G, fibre, PBX.', competencies: ['VoIP','SIP','RAN','Fibre'] },
    { title: 'Ingénieur Plateforme (Platform Engineer)', family: 'Spécialisations & Transverse', popularity: 72, description: 'Plateformes internes (PaaS).', competencies: ['Kubernetes','Backstage','Terraform','CI/CD'] },
    { title: 'Site Reliability Engineer (SRE)', family: 'Spécialisations & Transverse', popularity: 74, description: 'Fiabilité et disponibilité.', competencies: ['SRE (SLO/SLA/SLI)','Toil Reduction','Incident Response','On-call'] },
    { title: 'Ingénieur MLOps', family: 'Spécialisations & Transverse', popularity: 70, description: 'Chaîne de valeur ML industrialisée.', competencies: ['ML Ops (déploiement/monitoring)','Features Store','Model Registry','Drift'] },
    { title: 'Ingénieur DataOps', family: 'Spécialisations & Transverse', popularity: 68, description: 'CI/CD des pipelines et qualité data.', competencies: ['DBT','Airflow','Testing data','Observabilité data'] },
    { title: 'Ingénieur Sécurité Applicative (AppSec)', family: 'Spécialisations & Transverse', popularity: 66, description: 'Sécurité intégrée au SDLC.', competencies: ['SAST','DAST','Threat Modeling','Secure Coding'] },
    { title: 'Ingénieur FinOps', family: 'Spécialisations & Transverse', popularity: 62, description: 'Optimisation des coûts cloud.', competencies: ['FinOps','Budgets','Tags/Showback','Alertes'] },
    { title: 'Ingénieur QA Performance', family: 'Spécialisations & Transverse', popularity: 60, description: 'Charge, stress, endurance.', competencies: ['JMeter','k6','Profiling','Bottlenecks'] },
    { title: 'Ingénieur Virtualisation / Containers', family: 'Spécialisations & Transverse', popularity: 64, description: 'Infra virtualisée et conteneurs.', competencies: ['VMware','Kubernetes','Containers','Storage'] },
    { title: 'Data Steward', family: 'Spécialisations & Transverse', popularity: 58, description: 'Qualité, documentation et règles d’usage.', competencies: ['Catalogue','Linéage','Qualité data','Glossaire'] },
    { title: 'Data Product Manager', family: 'Spécialisations & Transverse', popularity: 62, description: 'Produits data et adoption.', competencies: ['Discovery data','KPIs','Gouvernance','Roadmap'] },
    { title: 'Ingénieur Sécurité Offensive (Red Team)', family: 'Spécialisations & Transverse', popularity: 56, description: 'Simulations d’attaques avancées.', competencies: ['TTP','Adversary Emulation','OPSEC','Reporting'] },
    { title: 'Ingénieur Sécurité Défensive (Blue Team)', family: 'Spécialisations & Transverse', popularity: 58, description: 'Détection et chasse aux menaces.', competencies: ['Threat Hunting','SIEM','EDR','Playbooks'] },
    { title: 'Ingénieur Réponse à Incident', family: 'Spécialisations & Transverse', popularity: 58, description: 'Coordination investigation et remédiation.', competencies: ['IR Plans','Forensic','Coordination','Communication de crise'] },
    { title: 'Architecte Data', family: 'Spécialisations & Transverse', popularity: 64, description: 'Modèles, flux et plateformes data.', competencies: ['Modélisation','OLTP/OLAP','Streaming','Gouvernance'] },
    { title: 'Ingénieur Réseaux Cloud', family: 'Spécialisations & Transverse', popularity: 60, description: 'Réseaux hybrides & interconnexions.', competencies: ['VPC/VNet','Peering','Transit Gateway','WAF'] },
    { title: 'Ingénieur Tests E2E', family: 'Spécialisations & Transverse', popularity: 60, description: 'Automatisation de scénarios bout-en-bout.', competencies: ['Cypress','Playwright','Pact','CI/CD'] },
    { title: 'Ingénieur Release / Build', family: 'Spécialisations & Transverse', popularity: 58, description: 'Packaging, versioning et publication.', competencies: ['SemVer','Release Trains','Pipelines','Artefacts'] },
    { title: 'Ingénieur Observabilité Front-End', family: 'Spécialisations & Transverse', popularity: 58, description: 'RUM et Core Web Vitals.', competencies: ['RUM','Core Web Vitals','Sourcemaps','Sentry'] },
    { title: 'Technical Writer', family: 'Spécialisations & Transverse', popularity: 54, description: 'Documentation technique claire et à jour.', competencies: ['Docs','Guide API','Style','IA pour la doc'] },
    { title: 'Ingénieur Accessibilité (a11y)', family: 'Spécialisations & Transverse', popularity: 56, description: 'Conformité WCAG/ARIA.', competencies: ['WCAG','ARIA','Audit','Remédiation'] },
    { title: 'Ingénieur Sécurité Mobile', family: 'Spécialisations & Transverse', popularity: 54, description: 'Sécurité des apps mobiles.', competencies: ['OWASP MASVS','Reverse','Hardening','SDK'] },
    { title: 'Architecte Microservices', family: 'Spécialisations & Transverse', popularity: 62, description: 'Systèmes distribués & patterns.', competencies: ['Event Sourcing','CQRS','Service Mesh','Observabilité'] },
    { title: 'Release Train Engineer (RTE)', family: 'Spécialisations & Transverse', popularity: 52, description: 'Coordination ARTs (SAFe).', competencies: ['SAFe','PI Planning','Dépendances','Amélioration continue'] },
    { title: 'Ingénieur Edge / CDN', family: 'Spécialisations & Transverse', popularity: 56, description: 'Optimisation delivery et sécurité edge.', competencies: ['CDN','Edge Functions','Caching','WAF/Bot'] },
    { title: 'Ingénieur Sécurité des Données', family: 'Spécialisations & Transverse', popularity: 58, description: 'Protection des données sensibles.', competencies: ['Chiffrement','Masquage','DLP','IAM'] },
    { title: 'Consultant Gouvernance Data', family: 'Spécialisations & Transverse', popularity: 54, description: 'Politiques, rôles et processus data.', competencies: ['Gouvernance','Qualité','RGPD','Stewardship'] },
    { title: 'Ingénieur Tests Mobile', family: 'Spécialisations & Transverse', popularity: 56, description: 'Automatisation des tests mobiles.', competencies: ['Appium','Firebase Test Lab','CI/CD','Devices Farm'] },
    { title: 'Ingénieur Scalabilité', family: 'Spécialisations & Transverse', popularity: 58, description: 'Montée en charge et résilience.', competencies: ['Load Testing','Sharding','Caching','HA/DR'] },
    { title: 'Ingénieur Sécurité DevSecOps', family: 'Spécialisations & Transverse', popularity: 60, description: 'Sécurité dans la supply chain logicielle.', competencies: ['SCA','SBOM','Sigstore','Policy as Code'] },
    { title: 'Ingénieur Réalité Étendue (XR)', family: 'Spécialisations & Transverse', popularity: 50, description: 'Expériences AR/VR/MR.', competencies: ['Unity','Unreal','Interactions','Optimisation rendu'] },
    { title: 'Ingénieur Data Visualization', family: 'Spécialisations & Transverse', popularity: 56, description: 'Dataviz & storytelling.', competencies: ['D3.js','ECharts','UX dataviz','Performance'] },
    { title: 'Analyste Produit (Product Analytics)', family: 'Spécialisations & Transverse', popularity: 58, description: 'Mesure d’usage et expérimentation.', competencies: ['Instrumentation','A/B Testing','Cohortes','SQL'] },
    { title: 'Responsable Qualité Logicielle', family: 'Spécialisations & Transverse', popularity: 56, description: 'Stratégie qualité et métriques.', competencies: ['KPIs qualité','Process','Audits','Amélioration continue'] },
    { title: 'Ingénieur API Management', family: 'Spécialisations & Transverse', popularity: 56, description: 'Portails, passerelles et sécurité API.', competencies: ['API Gateway','OAuth2/OIDC','Rate limiting','Monitoring'] },
    { title: 'Spécialiste RPA (Automatisation Robotique)', family: 'Spécialisations & Transverse', popularity: 54, description: 'Automatisation de processus métiers.', competencies: ['UiPath','Automation Anywhere','Process Mining','Monitoring'] },
    { title: 'Consultant CRM (Salesforce, Dynamics)', family: 'Spécialisations & Transverse', popularity: 58, description: 'Paramétrage et extensions CRM.', competencies: ['Salesforce','Dynamics','Intégrations','Reporting'] },
]


// --------------------------------------------------
// MAIN
// --------------------------------------------------
async function main() {
    await prisma.$transaction([
        prisma.job.deleteMany({}),
        prisma.jobFamily.deleteMany({}),
        prisma.competency.deleteMany({}),
        prisma.competenciesFamily.deleteMany({}),
    ])

    // Job families
    const familyMap = new Map<string, string>()
    for (const name of jobFamilies) {
        const created = await prisma.jobFamily.create({
            data: { name, normalizedName: normalizeName(name) },
        })
        familyMap.set(name, created.id)
    }

    // Competency families
    const compFamilyMap = new Map<CompFamilyKey, string>()
    for (const cf of competencyFamilies) {
        const created = await prisma.competenciesFamily.create({
            data: { name: cf.name, normalizedName: normalizeName(cf.name), description: cf.description },
        })
        compFamilyMap.set(cf.name, created.id)
    }

    // Competencies with link to exactly one family (M2M table)
    for (const c of competenciesSeed) {
        await prisma.competency.create({
            data: {
                name: c.name,
                normalizedName: normalizeName(c.name),
                families: { connect: [{ id: compFamilyMap.get(c.family)! }] },
            },
        })
    }

    // Jobs + connect relevant competencies by name
    for (const j of jobs) {
        const connects = (j.competencies ?? []).filter((c) => competenciesSeed.some((c2) => c2.name === c))
            .map((n) => ({ name: n }))
        await prisma.job.create({
            data: {
                jobFamilyId: familyMap.get(j.family)!,
                title: j.title,
                normalizedName: normalizeName(j.title),
                description: j.description,
                popularity: j.popularity ?? 0,
                competencies: connects.length ? { connect: connects } : undefined,
            },
        })
        console.log(`Seeded job: ${j.title}`)
    }

    console.log('Seed OK: familles de jobs, familles de compétences (Savoir-faire/Savoir-être), compétences (1..4) et jobs insérés.')
}

main()
    .then(async () => { await prisma.$disconnect() })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
