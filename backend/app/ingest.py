import io
import hashlib
from typing import List, Tuple, Dict
from pypdf import PdfReader
import docx
from app.schema import KnowledgeGraph, Entity, Relationship, Property
from app.extractor import GraphExtractor


def compute_document_hash(content: bytes) -> str:
    """Compute SHA-256 hash of raw document bytes."""
    return hashlib.sha256(content).hexdigest()


def compute_chunk_hash(chunk: str) -> str:
    """Compute SHA-256 hash of a text chunk."""
    return hashlib.sha256(chunk.encode("utf-8")).hexdigest()


def parse_file_content(filename: str, content: bytes) -> str:
    """
    Parses text content from PDF, DOCX, TXT, and MD file byte streams.
    """
    lower_filename = filename.lower()
    
    if lower_filename.endswith('.pdf'):
        pdf_file = io.BytesIO(content)
        reader = PdfReader(pdf_file)
        extracted_pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                extracted_pages.append(text)
        return "\n\n".join(extracted_pages)
        
    elif lower_filename.endswith('.docx'):
        docx_file = io.BytesIO(content)
        doc = docx.Document(docx_file)
        extracted_paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(extracted_paragraphs)
        
    elif lower_filename.endswith('.txt') or lower_filename.endswith('.md'):
        return content.decode('utf-8', errors='ignore')
        
    else:
        # Fallback to UTF-8 decoding
        return content.decode('utf-8', errors='ignore')

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """
    Splits text into chunks of specified size with overlapping windows.
    """
    if not text or not text.strip():
        return []
        
    text = text.strip()
    if len(text) <= chunk_size:
        return [text]
        
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start += (chunk_size - overlap)
        
    return chunks

def process_uploaded_files(file_data: List[Tuple[str, bytes]], extractor: GraphExtractor) -> KnowledgeGraph:
    """
    Parses multiple files, chunks them, runs extraction, and merges entities/relationships.
    """
    all_entities: Dict[str, Entity] = {}
    all_relationships: Dict[str, Relationship] = {}

    for filename, content in file_data:
        raw_text = parse_file_content(filename, content)
        if not raw_text.strip():
            continue

        chunks = chunk_text(raw_text)
        for chunk in chunks:
            try:
                sub_graph = extractor.extract(chunk)
                
                # Merge entities by unique lowercase ID
                for entity in sub_graph.entities:
                    if entity.id in all_entities:
                        # Append properties if new keys are present
                        existing = all_entities[entity.id]
                        existing_keys = {p.key for p in existing.properties}
                        for p in entity.properties:
                            if p.key not in existing_keys:
                                existing.properties.append(p)
                    else:
                        all_entities[entity.id] = entity

                # Merge relationships by (source, type, target) key
                for rel in sub_graph.relationships:
                    rel_key = f"{rel.source}:{rel.type}:{rel.target}"
                    if rel_key not in all_relationships:
                        all_relationships[rel_key] = rel

            except Exception as e:
                print(f"Warning: Failed to extract graph from chunk of file {filename}: {e}")
                continue

    return KnowledgeGraph(
        entities=list(all_entities.values()),
        relationships=list(all_relationships.values())
    )
