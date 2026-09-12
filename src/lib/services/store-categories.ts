// FILE: src/lib/services/store-categories.ts
//
// A controlled category list for the storefront.
//
// Categories used to be created from whatever the AI analyst returned for a
// candidate — "gaming accessories", "Consumer Goods", "Home Utility", and
// sometimes the product name itself. Each new phrasing created a permanent new
// category, so the catalogue filled with near-duplicates and one-product
// categories that no shopper would ever click.
//
// The analyst's answer is still useful as a signal; it just should not be
// allowed to define the navigation. Its text is mapped onto a fixed set here,
// falling back to the product keyword when the analyst is vague.

export interface StoreCategory {
  name: string;
  slug: string;
  /// Lower-cased substrings that map a candidate into this category.
  match: string[];
}

/*
 * Ordered by specificity, most specific first.
 *
 * "gaming mouse pad" must reach Computer & Gaming before the word "mouse" or
 * "pad" drags it somewhere vaguer, so the narrow categories are tested first.
 */
export const STORE_CATEGORIES: StoreCategory[] = [
  {
    name: "Mobile Accessories",
    slug: "mobile-accessories",
    match: [
      "phone case",
      "phone cover",
      "screen protector",
      "tempered glass",
      "phone stand",
      "phone holder",
      "phone mount",
      "power bank",
      "charging cable",
      "charger",
      "wireless charging",
      "mobile accessor",
      "smartphone",
    ],
  },
  {
    name: "Computer & Gaming",
    slug: "computer-gaming",
    match: [
      "gaming",
      "mouse pad",
      "mousepad",
      "keyboard",
      "mouse",
      "laptop stand",
      "laptop cooling",
      "webcam",
      "monitor",
      "computer accessor",
      "cable management",
      "usb hub",
      "pc ",
    ],
  },
  {
    name: "Audio & Wearables",
    slug: "audio-wearables",
    match: [
      "earbud",
      "earphone",
      "headphone",
      "headset",
      "bluetooth speaker",
      "speaker",
      "smartwatch",
      "watch band",
      "watch strap",
      "audio",
    ],
  },
  {
    name: "Kitchen & Dining",
    slug: "kitchen-dining",
    match: [
      "kitchen",
      "cookware",
      "cutting board",
      "knife",
      "lunch box",
      "tiffin",
      "water bottle",
      "flask",
      "mug",
      "coffee",
      "tea ",
      "food storage",
      "spice",
      "oil dispenser",
      "dining",
      "bakeware",
      "utensil",
    ],
  },
  {
    name: "Cleaning & Household",
    slug: "cleaning-household",
    match: [
      "cleaning",
      "microfiber",
      "mop",
      "dishwash",
      "sponge",
      "scrub",
      "laundry",
      "detergent",
      "waste",
      "compost",
      "bin ",
      "pest control",
      "mosquito",
    ],
  },
  {
    name: "Home Storage & Organisation",
    slug: "home-storage",
    match: [
      "organizer",
      "organiser",
      "storage",
      "shelf",
      "rack",
      "drawer divider",
      "wardrobe",
      "closet",
      "hanger",
      "shoe storage",
      "under-bed",
      "under bed",
    ],
  },
  {
    name: "Bath & Personal Care",
    slug: "bath-personal-care",
    match: [
      "bathroom",
      "shower",
      "grooming",
      "shaving",
      "beard",
      "hair styling",
      "hair dryer",
      "nail",
      "makeup",
      "skincare",
      "toothbrush",
      "personal care",
    ],
  },
  {
    name: "Home Decor & Lighting",
    slug: "home-decor",
    match: [
      "decor",
      "wall art",
      "photo frame",
      "candle",
      "fragrance",
      "led light",
      "lighting",
      "lamp",
      "artificial plant",
      "curtain",
      "cushion",
    ],
  },
  {
    name: "Garden & Outdoor",
    slug: "garden-outdoor",
    match: [
      "garden",
      "planter",
      "plant ",
      "seeds",
      "balcony",
      "camping",
      "outdoor",
      "fishing",
    ],
  },
  {
    name: "Pet Supplies",
    slug: "pet-supplies",
    match: ["pet ", "dog ", "cat ", "aquarium", "bird ", "grooming pet"],
  },
  {
    name: "Baby & Kids",
    slug: "baby-kids",
    match: ["baby", "infant", "toddler", "kids", "nursery", "educational toy"],
  },
  {
    name: "Stationery & Office",
    slug: "stationery-office",
    match: [
      "stationery",
      "desk accessor",
      "office desk",
      "school suppl",
      "art and craft",
      "craft suppl",
      "notebook",
      "pen ",
      "ergonomic",
    ],
  },
  {
    name: "Fitness & Sports",
    slug: "fitness-sports",
    match: [
      "fitness",
      "yoga",
      "gym",
      "resistance",
      "sports",
      "exercise",
      "workout",
    ],
  },
  {
    name: "Travel & Bags",
    slug: "travel-bags",
    match: [
      "travel",
      "luggage",
      "backpack",
      "bag",
      "wallet",
      "card holder",
      "pouch",
    ],
  },
  {
    name: "Fashion Accessories",
    slug: "fashion-accessories",
    match: [
      "jewellery",
      "jewelry",
      "necklace",
      "earring",
      "bracelet",
      "sunglass",
      "hair band",
      "scrunchie",
      "belt",
    ],
  },
  {
    name: "Tools & Hardware",
    slug: "tools-hardware",
    match: [
      "tool",
      "hardware",
      "drill",
      "screwdriver",
      "measuring",
      "diy",
      "repair",
    ],
  },
  {
    name: "Automotive",
    slug: "automotive",
    match: ["car ", "automotive", "motorcycle", "bike ", "cycling", "vehicle"],
  },
  {
    name: "Festive & Gifting",
    slug: "festive-gifting",
    match: [
      "diwali",
      "rakhi",
      "festive",
      "gift",
      "wedding",
      "pooja",
      "puja",
      "religious",
      "party suppl",
      "decoration",
    ],
  },
  {
    name: "Hobbies & Music",
    slug: "hobbies-music",
    match: [
      "musical",
      "guitar",
      "instrument",
      "photography",
      "camera",
      "hobby",
      "collectible",
    ],
  },
];

/*
 * Deliberately vague. Nothing should land here often, and when it does it is a
 * signal that STORE_CATEGORIES needs another entry rather than that the product
 * is genuinely uncategorisable.
 */
export const FALLBACK_CATEGORY: StoreCategory = {
  name: "General",
  slug: "general",
  match: [],
};

/*
 * Maps a candidate onto one store category.
 *
 * The keyword is checked BEFORE the analyst's label, because the keyword
 * describes the actual product while the analyst's category is an
 * interpretation that varies between models and runs — the same product was
 * labelled "gaming accessories" by one model and "Consumer Goods" by another on
 * consecutive days.
 */
export function resolveStoreCategory(
  keyword: string,
  analystCategory?: string | null,
): StoreCategory {
  const haystacks = [
    ` ${(keyword || "").toLowerCase()} `,
    ` ${(analystCategory || "").toLowerCase()} `,
  ];

  for (const haystack of haystacks) {
    for (const category of STORE_CATEGORIES) {
      if (category.match.some((term) => haystack.includes(term))) {
        return category;
      }
    }
  }

  return FALLBACK_CATEGORY;
}
