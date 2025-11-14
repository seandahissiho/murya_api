const competencySchema = {
    "kind": {
        "type": "enum: Type of competency, at least two SavoirEtre per family",
        "values": ["SavoirFaire", "SavoirEtre"],
        "example": "SavoirFaire"
    },
    "name": {
        "type": "string: Name of the competency",
        "example": "Définir la vision produit"
    },
    "slug": {
        "type": "string: Normalized slug of the competency (lowercase, hyphens)",
        "example": "definir-la-vision-produit"
    },
    "acquisitionLevel": {
        "type": "enum: Level of acquisition",
        "values": ["Facile", "Moyen", "Difficile", "Expert"],
        "example": "Facile"
    },
    "family": {
        "type": "string: Competency family in One Word",
        "example": "Vision"
    },
    "subFamily": {
        "type": "string: Competency sub-family in One Word",
        "example": "Stratégie"
    },
    "description": {
        "type": "string: Description of the competency 45 characters max",
        "example": "Ability to define a clear and compelling product vision that aligns with company goals and market needs."
    }
}

const competencyFamilySchema = {
    "name": {
        "type": "string: Name of the competency family",
        "example": "Vision"
    },
    "subFamilies": {
        "type": "array of sub-family objects",
        "example": [
            {
                "name": "Stratégie",
                "description": "Competencies related to strategic planning and vision setting for products."
            }
        ]
    }
}

const jobSchema = {
    "title": {
        "type": "string: Job title",
        "example": "Product Manager"
    },
    "normalizedName": {
        "type": "string: Normalized job name (lowercase, no spaces)",
        "example": "product_manager"
    },
    "description": {
        "type": "string: Detailed job description",
        "example": "Responsible for defining product vision, strategy, and roadmap while collaborating with cross-functional teams to deliver value to customers."
    },
    "competencies": {
        "type": "array of competency objects",
        "example": [
            {
                "kind": "SavoirFaire",
                "name": "Définir la vision produit",
                "acquisitionLevel": "Facile",
                "family": "Vision",
                "subFamily": "Stratégie",
                "description": "Ability to define a clear and compelling product vision that aligns with company goals and market needs."
            }
        ]
    },
    "competencyFamilies": {
        "type": "array of competency family objects",
        "example": [
            {
                "name": "Vision",
                "subFamilies": [
                    {
                        "name": "Stratégie",
                        "description": "Competencies related to strategic planning and vision setting for products."
                    }
                ]
            }
        ]
    },
}

const fullSchema = {
    "jobTitle": "string",
    "jobDescription": "string",
    "normalizedJobName": "string",
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
                            "description": "string"
                        }
                    ]
                }
            ]
        }
    ]
}

const descriptionsSchema = {}

const quizStructSchema = {
    "title": {
        "type": "string: Title of the quiz",
        "example": "Product Manager Positioning Quiz 1"
    },
    "description": {
        "type": "string: Description of the quiz",
        "example": "A quiz to assess the knowledge and skills of a Product Manager."
    },
    "level": {
        "type": "enum: Difficulty level of the quiz",
        "values": ["EASY", "MEDIUM", "HARD", "EXPERT", "MIX"],
        "example": "EASY"
    },
    "questions": {
        "type": "array of quiz question objects",
        "example": [
            {
                "text": "What is the primary responsibility of a Product Manager?",
                "timeLimitInSeconds": 30,
                "points": 5,
                "type": "single_choice",
                "mediaUrl": "",
                "index": 1,
                "metadata": null,
                "competencySlug": "definir-la-vision-produit",
                "responses": []
            }
        ],
    },
    "responses": {
        "type": "array of quiz response objects (4 per question)",
        "example": [
            {
                "text": "Defining the product vision and strategy.",
                "metadata": null,
                "isCorrect": true,
                "index": 1
            }
        ]
    }
}

const quizSchema = {
    "title": "string",
    "description": "string",
    "level": "EASY|MEDIUM|HARD|EXPERT|MIX",
    "questions": [
        {
            "text": "string",
            "timeLimitInSeconds": "number",
            "points": "number",
            "type": "single_choice",
            "mediaUrl": "string",
            "index": "number",
            "metadata": "object|null",
            "competencySlug": "string",
            "responses": [
                {
                    "text": "string",
                    "metadata": "object|null",
                    "isCorrect": "boolean",
                    "index": "number"
                }
            ]
        }
    ]
}