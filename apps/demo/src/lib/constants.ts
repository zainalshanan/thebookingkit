/** Barber shop constants — safe to import from both client and server */

export const BARBER_SHOP = {
  name: "Fade & Shave Barbershop",
  tagline: "Classic cuts, modern style",
  provider: "Marcus Johnson",
  timezone: "America/New_York",
  location: "123 Main Street, Brooklyn, NY 11201",
};

export interface Service {
  slug: string;
  title: string;
  duration: number;
  price: number;
  description: string;
  icon: string;
  questions?: { key: string; label: string; type: string; isRequired: boolean; options?: string[] }[];
}

export const SERVICES: Service[] = [
  {
    slug: "haircut",
    title: "Classic Haircut",
    duration: 30,
    price: 35,
    icon: "scissors",
    description: "Precision cut with clippers and scissors, includes hot towel finish.",
  },
  {
    slug: "beard-trim",
    title: "Beard Trim & Shape",
    duration: 20,
    price: 20,
    icon: "beard",
    description: "Professional beard sculpting with straight razor edge-up.",
  },
  {
    slug: "haircut-beard",
    title: "Haircut + Beard Combo",
    duration: 45,
    price: 50,
    icon: "combo",
    description: "Full haircut with beard trim and shape. Our most popular service.",
    questions: [
      {
        key: "style",
        label: "Preferred style",
        type: "single_select",
        isRequired: true,
        options: ["Fade", "Taper", "Crew Cut", "Pompadour", "Buzz Cut", "Other"],
      },
      {
        key: "beard_length",
        label: "Beard length preference",
        type: "single_select",
        isRequired: false,
        options: ["Short stubble", "Medium", "Full length", "Just shape it"],
      },
    ],
  },
  {
    slug: "hot-towel-shave",
    title: "Hot Towel Shave",
    duration: 30,
    price: 30,
    icon: "razor",
    description: "Traditional straight razor shave with hot towel treatment and aftershave.",
  },
  {
    slug: "kids-cut",
    title: "Kids Cut (12 & under)",
    duration: 20,
    price: 22,
    icon: "kids",
    description: "Patient and fun haircuts for the little ones.",
    questions: [
      {
        key: "age",
        label: "Child's age",
        type: "number",
        isRequired: true,
      },
    ],
  },
  {
    slug: "deluxe-grooming",
    title: "Deluxe Grooming Package",
    duration: 75,
    price: 85,
    icon: "deluxe",
    description: "Haircut, beard trim, hot towel shave, and scalp massage. The full experience.",
    questions: [
      {
        key: "style",
        label: "Preferred haircut style",
        type: "single_select",
        isRequired: true,
        options: ["Fade", "Taper", "Crew Cut", "Pompadour", "Buzz Cut", "Other"],
      },
      {
        key: "allergies",
        label: "Any skin allergies or sensitivities?",
        type: "long_text",
        isRequired: false,
      },
      {
        key: "first_visit",
        label: "Is this your first visit?",
        type: "single_select",
        isRequired: true,
        options: ["Yes", "No"],
      },
    ],
  },
];
