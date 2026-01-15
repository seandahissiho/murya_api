# 🧑‍💻 Rôles & responsabilités dans un SOC (Security Operations Center)

> **Un SOC**, c’est l’équipe “terrain” qui **détecte, analyse et répond** aux événements de cybersécurité, avec un mix : **personnes + processus + technologies**.

---

## 🎯 Mission d’un SOC (en 1 phrase)
✅ **Repérer les attaques tôt** et **limiter les dégâts** (sur les systèmes, les données, l’activité).

---

## 🧩 Comment est organisée une équipe SOC ?

La taille varie selon l’entreprise, mais on retrouve souvent une structure par **niveaux** (Level 1 → Level 3).  
👉 Plus le niveau est élevé, plus on traite des incidents **complexes** et plus on est **proactif**.

---

# 🥇 Niveau 1 — Analyste SOC (tri des alertes)

## 🧠 Ce que fait le Level 1
- Reçoit les **alertes** (SIEM/EDR, etc.)
- Vérifie si c’est un **vrai incident** ou un **faux positif**
- Enrichit l’alerte (logs, contexte, IP, utilisateur, machine)
- Classe la **sévérité** (faible / moyen / critique)
- Escalade si besoin vers le niveau 2

## ✅ Exemple concret (niveau 1)
🔔 “Connexion suspecte depuis un pays inconnu”  
➡️ L1 vérifie :
- heure de connexion
- appareil utilisé
- historique de l’utilisateur
- si l’adresse IP est connue comme malveillante  
➡️ Puis décide : **incident** ou **fausse alerte**.

---

# 🥈 Niveau 2 — Réponse à incident (investigation + action)

## 🧠 Ce que fait le Level 2
- Prend les alertes **prioritaires** transmises par L1
- Analyse l’attaque : **comment ? où ? jusqu’où ?**
- Utilise la **Threat Intelligence** (IOC, règles, signatures)
- Met en place une stratégie :
  - **endiguement** (containment)
  - **éradication**
  - **reprise** (recovery)

## ✅ Exemple concret (niveau 2)
🦠 “Machine infectée”  
➡️ L2 peut :
- isoler le poste (EDR)
- bloquer des IP/domaines
- révoquer des sessions
- lancer une chasse sur d’autres machines similaires
- produire un rapport d’incident

---

# 🥉 Niveau 3 — Threat Hunter (chasse proactive + expertise avancée)

## 🧠 Ce que fait le Level 3
- Gère les incidents **les plus graves**
- Cherche des menaces **cachées** (proactif)
- Conduit des évaluations :
  - **vulnérabilités**
  - **tests d’intrusion** (selon organisation)
- Améliore les outils et les règles de détection
- Consolide les infos collectées par L1/L2 et pilote l’analyse avancée

## ✅ Exemple concret (niveau 3)
🕵️ “Attaque sophistiquée / mouvement latéral”  
➡️ L3 va :
- reconstruire la chronologie
- identifier la technique (MITRE ATT&CK)
- détecter d’autres traces invisibles
- proposer des améliorations durables

---

# 🧑‍🏫 Responsable SOC (lead/manager)

## 🧠 Ce que fait le responsable SOC
- Supervise l’équipe (organisation, planning, qualité)
- Recrute, forme, évalue
- Met en place des **processus** et des **playbooks**
- Gère la communication en cas de crise
- Suit le budget et la performance
- Produit des audits/rapports (pour RSSI/dirigeants)

---

# 🧰 Postes spécialisés (fonctions “bonus” dans un SOC)

Selon la maturité du SOC, on peut aussi avoir :

- 🧬 **Analyste malware / reverse engineer** : démonte un malware pour comprendre son comportement
- 🧾 **Forensic analyst** : collecte des preuves numériques et mène l’enquête
- 🧱 **Vulnerability manager** : suit et corrige les failles en continu
- 🏗️ **Architecte sécurité** : conçoit l’infrastructure de sécurité et propose des améliorations
- 🧭 **Consultant sécurité** : évalue la maturité, compare aux bonnes pratiques et recommande des évolutions

---

## 🚀 “Carrière” (chemin simple)
📌 Exemple de progression typique :

**L1 (tri)** → **L2 (réponse)** → **L3 (chasse)** → **Lead / Manager**  
ou  
**L2** → **Forensic** / **Malware** / **Vulnérabilités** / **Architecture**

---

## 🧠 Mini-glossaire
- **Alerte** : signal “suspect” généré par un outil  
- **Faux positif** : alerte qui semble grave… mais ne l’est pas  
- **Threat Intelligence** : infos sur menaces (IOC, techniques, campagnes)  
- **IOC** (*Indicator of Compromise*) : indicateur de compromission (hash, IP, domaine…)  
- **Containment** : endiguement → empêcher la propagation

---

## 🧾 Fiche “À retenir” (20 secondes)
✅ Un SOC fonctionne par **chaîne de rôles complémentaires**  
✅ L1 filtre, L2 agit, L3 chasse et améliore  
✅ Les managers assurent process, qualité, communication de crise  
✅ Il existe des rôles spécialisés (forensic, malware, vulnérabilités…)

---

## 🧪 Mini-quiz (post-bac)

**1) Qui s’occupe surtout du tri des alertes ?**  
A. Niveau 1  
B. Niveau 2  
C. Niveau 3

**2) Qui met en place des actions d’endiguement et de reprise ?**  
A. Niveau 1  
B. Niveau 2  
C. Niveau 3

**3) Qui cherche des menaces cachées, même sans alerte ?**  
A. Niveau 1  
B. Niveau 2  
C. Niveau 3

<details>
<summary>✅ Corrigé</summary>

1) **A**  
2) **B**  
3) **C**

</details>

---

## 🔗 Source
- Palo Alto Networks — *Rôles et responsabilités du SOC (Security Operations Center)*  
  https://www.paloaltonetworks.fr/cyberpedia/soc-roles-and-responsibilities
