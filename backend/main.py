import os
import traceback
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
import pydantic
from legal_ai import construir_prompt

# Cargar variables de entorno
load_dotenv()

app = FastAPI(title="API Traductor Judicial - Lenguaje Ciudadano")

# Configurar CORS para permitir peticiones desde React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("ADVERTENCIA: No se encontró la variable GEMINI_API_KEY en tu archivo .env")

# 🛠️ CORRECCIÓN CLAVE: Forzar el uso de la versión 'v1beta' para permitir JSON Schema
client = genai.Client(
    api_key=api_key,
    http_options={"api_version": "v1beta"}
)


# Esquema JSON estricto
class LegalResponseSchema(pydantic.BaseModel):
    expediente: str
    juzgado: str
    resumen_antecedentes: str
    fundamentos_clave: list[str]
    resolucion_fallo: str
    traduccion_ciudadana: str


@app.get("/")
def read_root():
    return {"estado": "Servidor de FastAPI activo y configurado correctamente"}


@app.post("/process-pdf")
async def process_pdf(file: UploadFile = File(...)):
    temp_file_path = f"temp_{file.filename}"
    uploaded_file = None

    try:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="El archivo subido no es un PDF válido.")

        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="El archivo PDF seleccionado está vacío.")

        with open(temp_file_path, "wb") as buffer:
            buffer.write(content)

        print(f" Archivo '{file.filename}' guardado temporalmente. Subiendo a la API de Gemini...")

        # Subir a la API de Gemini
        uploaded_file = client.files.upload(file=temp_file_path)

        prompt = construir_prompt()

        print("🤖 Enviando documento a Gemini para análisis y estructuración JSON (v1beta)...")

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[uploaded_file, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=LegalResponseSchema,
                temperature=0.2,
            ),
        )

        usage = response.usage_metadata
        print(
            "📊 Tokens -> "
            f"Entrada: {getattr(usage, 'prompt_token_count', 0)} | "
            f"Salida: {getattr(usage, 'candidates_token_count', 0)} | "
            f"Pensamiento: {getattr(usage, 'thoughts_token_count', 0)} | "
            f"Total: {getattr(usage, 'total_token_count', 0)}"
        )

        print("✅ Análisis completado con éxito.")
        return response.parsed

    except HTTPException as he:
        raise he

    except Exception as e:
        print("\n❌ OCURRIÓ UN ERROR CRÍTICO AL PROCESAR EL PDF:")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor al procesar la IA: {str(e)}"
        )

    finally:
        if uploaded_file is not None:
            try:
                client.files.delete(name=uploaded_file.name)
            except Exception:
                pass
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            print(f"Archivo temporal {temp_file_path} eliminado correctamente de la PC.")