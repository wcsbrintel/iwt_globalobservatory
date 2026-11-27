"""Conservative national wildlife eligibility, aligned with browser adapter."""
import re, unicodedata
def words(value):
 value=unicodedata.normalize("NFKD",str(value or ""))
 return re.sub(r"[^a-z0-9]+"," ","".join(c for c in value if not unicodedata.combining(c)).lower()).strip()
ANIMAL=re.compile(r"\b(?:fauna|animais?|animalia|aves?|birds?|mammalia|mamiferos?|mammals?|repteis|reptil|reptilia|reptiles?|anfibios?|amphibia|amphibians?|peixes?|fish|pisces|actinopterygii|chondrichthyes|invertebrados?|insects?|insetos?|insecta|aracnideos?|arachnida|crustaceos?|crustacea|moluscos?|mollusca|cnidaria|equinodermos?|echinodermata)\b")
PLANT=re.compile(r"\b(?:flora|plantas?|plantae|vegetais?|vegetal|arvores?|madeiras?|fungos?|fungi|algas?|botanica|angiospermas?|gimnospermas?|forestal|florestal)\b")
WOOD=re.compile(r"^(?:m\s*3|metro[s]?\s+cubico[s]?|st|estereo[s]?)$")
FOREST=re.compile(r"\b(?:madeira[s]?|toras?|lenha|carvao vegetal|produto[s]? florestal|produtos florestais|origem florestal|serraria|desmatamento|vegetacao|flora|supressao|arvores?|exploracao florestal)\b")
DIRECT=re.compile(r"\b(?:animais? silvestres?|animais? da fauna|especimes? da fauna|fauna silvestre|caca predatoria|cacar|apanhar animais|capturar animais|comercio de animais|maus tratos (?:a|de|contra) animais|aves silvestres?|passaros silvestres?|animais? nativos?)\b")
GENERIC=re.compile(r"\b(?:flora e fauna|fauna e flora|flora ou fauna|fauna ou flora|flora flora|fauna flora|flora fauna)\b")
def plant(item): return bool(PLANT.search(words(item.get("group"))) or WOOD.fullmatch(words(item.get("unit"))))
def animal(item): return bool(ANIMAL.search(words(item.get("group"))) and not plant(item))
def eligibility(p):
 o=p.get("official") or {}
 kind=words(o.get("administrative_class") or p.get("type"))
 desc=GENERIC.sub(" ",words(o.get("infraction_description") or p.get("description")))
 detail=GENERIC.sub(" ",words(o.get("narrative_detail")))
 items=p.get("species_referenced",[])+p.get("seized_specimens",[])
 official=bool(re.search(r"\bfauna\b",kind) and not PLANT.search(kind))
 positive=any(animal(i) for i in items)
 forestry=bool(FOREST.search(desc) or FOREST.search(detail) and any(plant(i) for i in items))
 conduct=bool(DIRECT.search(desc) or DIRECT.search(detail))
 if positive:return True,"documented_animal_specimen"
 if forestry and not conduct:return False,"forest_only_or_generic_legal_reference"
 if official and not forestry:return True,"official_fauna_class"
 if conduct and not forestry:return True,"direct_fauna_conduct"
 return False,"mixed_or_forest_without_animal_evidence" if forestry else "no_direct_fauna_evidence"
