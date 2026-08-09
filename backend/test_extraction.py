import sys
import os
from dotenv import load_dotenv

# Ensure we can import from the app directory
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

# Load local .env variables
load_dotenv()

from app.extractor import GraphExtractor

def main():
    print("Initializing GraphExtractor...")
    try:
        extractor = GraphExtractor()
    except ValueError as e:
        print(f"\n[ERROR] Configuration Error: {e}")
        print("Please create a backend/.env file and set GEMINI_API_KEY, or export it in your environment.")
        sys.exit(1)
        
    sample_text = (
        "Subrat developed CortexGraph AI. CortexGraph AI is a Graph RAG system built using React, "
        "FastAPI, Neo4j, and ChromaDB. It uses the Gemini API to analyze document text."
    )
    
    print("\n--- Input Text ---")
    print(sample_text)
    print("------------------")
    
    print("\nSending text to Gemini for graph extraction...")
    try:
        graph = extractor.extract(sample_text)
        
        print("\n=== Extracted Entities ===")
        for entity in graph.entities:
            print(f"- [{entity.type}] {entity.name} (ID: {entity.id}) {f'Properties: {entity.properties}' if entity.properties else ''}")
            
        print("\n=== Extracted Relationships ===")
        for rel in graph.relationships:
            print(f"- {rel.source} --({rel.type})--> {rel.target} {f'Properties: {rel.properties}' if rel.properties else ''}")
            
        print("\nExtraction test successful!")
    except Exception as e:
        print(f"\n[ERROR] Extraction failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
