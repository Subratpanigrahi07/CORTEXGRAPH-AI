import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased timeout for Phase 2 pipeline operations
  headers: {
    'Content-Type': 'application/json',
  },
});

// ═══════════════════════════════════════════════════════
// Phase 1 Types (preserved)
// ═══════════════════════════════════════════════════════

export interface ExtractionRequest {
  text: string;
  instruction?: string;
  model?: string;
}

export interface Property {
  key: string;
  value: string;
}

export interface Entity {
  id: string;
  name: string;
  type: string;
  properties: Property[];
}

export interface Relationship {
  source: string;
  target: string;
  type: string;
  properties: Property[];
}

export interface KnowledgeGraph {
  entities: Entity[];
  relationships: Relationship[];
}

export interface ChatRequest {
  query: string;
  history?: { sender: string; text: string }[];
  graph?: KnowledgeGraph | null;
  context_text?: string | null;
  model?: string;
}

export interface STTResponse {
  text: string;
  engine: string;
}

export const sendAudioForSTT = async (audioBlob: Blob, filename = 'recording.webm'): Promise<STTResponse> => {
  const formData = new FormData();
  formData.append('file', audioBlob, filename);

  const response = await apiClient.post<STTResponse>('/stt', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 30000,
  });

  return response.data;
};

export interface ChatResponse {
  answer: string;
  activated_nodes: string[];
  intent?: 'CASUAL_CONVERSATION' | 'GENERAL_KNOWLEDGE' | 'KNOWLEDGE_BASE_QUERY' | 'HYBRID_QUERY';
  telemetry?: {
    intent_classification_ms: number;
    vector_retrieval_ms: number;
    graph_retrieval_ms: number;
    llm_generation_ms: number;
    total_request_ms: number;
  };
  explanation?: {
    explanation: string;
    sources: { document_id: string; filename: string }[];
    graph_paths: string[];
    source_agreement: number;
    confidence_summary: string;
  } | null;
}

export interface DocumentUploadResponse {
  filename: string;
  text: string;
  graph: KnowledgeGraph;
  document_id?: string;
  pipeline_job_id?: string;
}

// ═══════════════════════════════════════════════════════
// Phase 2 Types
// ═══════════════════════════════════════════════════════

export interface MergeSuggestion {
  id: string;
  candidate_name: string;
  candidate_type: string;
  canonical_id: string;
  canonical_name: string;
  similarity_score: number;
  string_similarity: number;
  embedding_similarity: number;
  neighbor_overlap: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Contradiction {
  id: string;
  entity_a_name: string;
  entity_b_name: string;
  relationship_type: string;
  source_doc_a: string;
  source_doc_b: string;
  source_span_a: string;
  source_span_b: string;
  classification: 'TRUE_CONTRADICTION' | 'COMPLEMENTARY_FACTS' | 'AMBIGUOUS' | null;
  status: 'open' | 'resolved';
  resolution: 'kept_a' | 'kept_b' | 'kept_both' | null;
  detected_at: string;
  resolved_at?: string | null;
}

export interface AnalyticsOverview {
  total_entities: number;
  total_relationships: number;
  entities_by_type: Record<string, number>;
  relationships_by_type: Record<string, number>;
  documents_indexed: number;
  last_updated: string | null;
}

export interface CentralityEntry {
  entity_name: string;
  entity_type: string;
  score: number;
  entity_id: string;
}

export interface CentralityResult {
  algorithm: string;
  entries: CentralityEntry[];
}

export interface CommunityEntry {
  community_id: number;
  entities: string[];
  size: number;
}

export interface CommunitiesResult {
  total_communities: number;
  communities: CommunityEntry[];
}

export interface PipelineStatus {
  job_id: string;
  overall_status: 'pending' | 'running' | 'completed' | 'failed';
  celery_state?: string;
  current_step?: string;
  detail?: string;
  result?: Record<string, number>;
  steps?: { step: string; detail: string; timestamp: string }[];
  error?: string;
}

export interface HealthStatus {
  status: string;
  version: string;
  api_key_configured: boolean;
  neo4j_configured: boolean;
  neo4j_connected: boolean;
  redis_connected: boolean;
  celery_workers: number;
}


// ═══════════════════════════════════════════════════════
// Health
// ═══════════════════════════════════════════════════════

export const checkEngineHealth = async (): Promise<boolean> => {
  try {
    const res = await axios.get('http://127.0.0.1:8000/health', { timeout: 3000 });
    return res.status === 200;
  } catch {
    return false;
  }
};

export const getHealthDetails = async (): Promise<HealthStatus | null> => {
  try {
    const res = await axios.get<HealthStatus>('http://127.0.0.1:8000/health', { timeout: 3000 });
    return res.data;
  } catch {
    return null;
  }
};


// ═══════════════════════════════════════════════════════
// Phase 1 Client-Side Fallback
// ═══════════════════════════════════════════════════════

function generateFallbackGraph(text: string): KnowledgeGraph {
  const entitiesMap = new Map<string, Entity>();
  const relationships: Relationship[] = [];

  const sentences = text
    .split(/[.!?]+(?:\s+|\s*$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const stopWords = new Set([
    'The', 'A', 'An', 'This', 'These', 'Those', 'They', 'It', 'We', 'He', 'She', 'You', 'I',
    'But', 'In', 'On', 'At', 'When', 'If', 'By', 'For', 'With', 'About', 'From', 'To', 'And',
    'Or', 'Is', 'Are', 'Was', 'Were', 'Be', 'Been', 'Has', 'Have', 'Had', 'Do', 'Does', 'Did'
  ]);

  const entityRegex = /\b[A-Z][a-zA-Z0-9]*(?:\s+(?:[A-Z][a-zA-Z0-9]*|[0-9]+(?:\.[0-9]+)?))*\b/g;

  sentences.forEach((sentence, sentenceIdx) => {
    const foundInSentence: string[] = [];
    let match;
    entityRegex.lastIndex = 0;

    while ((match = entityRegex.exec(sentence)) !== null) {
      const name = match[0].trim();
      if (name.length <= 2 || stopWords.has(name) || /^[0-9]+$/.test(name)) continue;

      const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      let type = 'Concept';
      const nameLower = name.toLowerCase();

      if (nameLower.includes('subrat') || nameLower.includes('user') || nameLower.includes('developer') || nameLower.includes('person')) {
        type = 'Person';
      } else if (nameLower.includes('db') || nameLower.includes('database') || nameLower.includes('neo4j') || nameLower.includes('chroma') || nameLower.includes('store') || nameLower.includes('graph')) {
        type = 'Database';
      } else if (nameLower.includes('react') || nameLower.includes('fastapi') || nameLower.includes('python') || nameLower.includes('typescript') || nameLower.includes('api') || nameLower.includes('gemini') || nameLower.includes('llm') || nameLower.includes('framework') || nameLower.includes('technology')) {
        type = 'Technology';
      } else if (nameLower.includes('cortex') || nameLower.includes('google') || nameLower.includes('openai') || nameLower.includes('company') || nameLower.includes('organization')) {
        type = 'Organization';
      }

      if (!entitiesMap.has(id)) {
        entitiesMap.set(id, { id, name, type, properties: [{ key: 'category', value: type }, { key: 'extracted_at', value: `sentence_${sentenceIdx + 1}` }] });
      }
      if (!foundInSentence.includes(id)) foundInSentence.push(id);
    }

    if (foundInSentence.length >= 2) {
      const sentenceLower = sentence.toLowerCase();
      let relType = 'RELATED_TO';
      if (sentenceLower.includes('develop') || sentenceLower.includes('create') || sentenceLower.includes('build')) relType = 'DEVELOPED';
      else if (sentenceLower.includes('use') || sentenceLower.includes('utilize') || sentenceLower.includes('run')) relType = 'USES';
      else if (sentenceLower.includes('integrate') || sentenceLower.includes('connect')) relType = 'INTEGRATES_WITH';
      else if (sentenceLower.includes('contain') || sentenceLower.includes('include') || sentenceLower.includes('has')) relType = 'CONTAINS';
      else if (sentenceLower.includes('depend') || sentenceLower.includes('require')) relType = 'DEPENDS_ON';
      else if (sentenceLower.includes('analyze') || sentenceLower.includes('query')) relType = 'ANALYZES';

      for (let i = 0; i < foundInSentence.length - 1; i++) {
        for (let j = i + 1; j < foundInSentence.length; j++) {
          const source = foundInSentence[i];
          const target = foundInSentence[j];
          const linkExists = relationships.some((r) => (r.source === source && r.target === target) || (r.source === target && r.target === source));
          if (!linkExists) {
            relationships.push({ source, target, type: relType, properties: [{ key: 'context', value: sentence.slice(0, 80) + '...' }] });
          }
        }
      }
    }
  });

  const entities = Array.from(entitiesMap.values());
  if (entities.length === 0) {
    return {
      entities: [
        { id: 'cortexgraph', name: 'CortexGraph AI', type: 'Technology', properties: [] },
        { id: 'subrat', name: 'Subrat', type: 'Person', properties: [] },
        { id: 'neo4j', name: 'Neo4j Database', type: 'Database', properties: [] }
      ],
      relationships: [
        { source: 'subrat', target: 'cortexgraph', type: 'DEVELOPED', properties: [] },
        { source: 'cortexgraph', target: 'neo4j', type: 'USES', properties: [] }
      ]
    };
  }
  return { entities, relationships };
}


// ═══════════════════════════════════════════════════════
// Phase 1 API Functions (preserved)
// ═══════════════════════════════════════════════════════

export const extractGraphData = async (data: ExtractionRequest): Promise<KnowledgeGraph> => {
  try {
    const response = await apiClient.post<KnowledgeGraph>('/extract', data);
    return response.data;
  } catch (err: any) {
    console.warn('[CortexGraph API] Backend extract unreachable, engaging intelligent fallback:', err?.message);
    return generateFallbackGraph(data.text);
  }
};

export const sendChatMessage = async (data: ChatRequest): Promise<ChatResponse> => {
  try {
    const response = await apiClient.post<ChatResponse>('/chat', data);
    return response.data;
  } catch (err: any) {
    console.warn('[CortexGraph API] Backend chat unreachable, engaging local RAG synthesis:', err?.message);

    const nodes = data.graph?.entities || [];
    const queryLower = data.query.toLowerCase();
    const matchedNodes = nodes.filter((n) => queryLower.includes(n.name.toLowerCase()) || queryLower.includes(n.type.toLowerCase()));
    const activated_nodes = (matchedNodes.length > 0 ? matchedNodes : nodes.slice(0, 3)).map((n) => n.id);

    let answer = '';
    if (data.context_text) {
      const sentences = data.context_text.split(/[.!?]+(?:\s+|\s*$)/).map((s) => s.trim()).filter((s) => s.length > 10);
      const queryWords = queryLower.split(/\W+/).filter((w) => w.length > 3 && !['what', 'where', 'when', 'show', 'tell', 'about', 'with', 'from', 'this', 'that'].includes(w));
      const scoredSentences = sentences.map((sentence) => {
        const sentenceLower = sentence.toLowerCase();
        let score = 0;
        queryWords.forEach((word) => { if (sentenceLower.includes(word)) score += 1; });
        return { sentence, score };
      });
      const matches = scoredSentences.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
      answer = matches.length > 0
        ? matches.slice(0, 3).map((m) => m.sentence).join('. ').replace(/\s+/g, ' ')
        : sentences.slice(0, 3).join('. ').replace(/\s+/g, ' ');
    } else {
      answer = `The knowledge graph contains ${nodes.length} entities and ${data.graph?.relationships.length || 0} relationships ready for exploration.`;
    }

    return { answer, activated_nodes };
  }
};

export const uploadDocument = async (file: File): Promise<DocumentUploadResponse> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<DocumentUploadResponse>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // Longer timeout for uploads
    });
    return response.data;
  } catch (err: any) {
    console.warn('[CortexGraph API] Backend upload unreachable, reading file locally:', err?.message);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || `Uploaded file: ${file.name}`);
      reader.onerror = () => resolve(`Uploaded file: ${file.name}`);
      reader.readAsText(file);
    });
    const graph = generateFallbackGraph(text);
    return { filename: file.name, text, graph };
  }
};


// ═══════════════════════════════════════════════════════
// Phase 2 API Functions
// ═══════════════════════════════════════════════════════

// ── Pipeline ─────────────────────────────────────────

export const triggerPipeline = async (documentId: string, chunks: string[], filename: string) => {
  const response = await apiClient.post(`/agents/pipeline/run/${documentId}`, { chunks, filename });
  return response.data;
};

export const getPipelineStatus = async (jobId: string): Promise<PipelineStatus> => {
  const response = await apiClient.get<PipelineStatus>(`/agents/pipeline/status/${jobId}`);
  return response.data;
};

// ── Entity Resolution ────────────────────────────────

export const getMergeSuggestions = async (): Promise<{ suggestions: MergeSuggestion[]; count: number }> => {
  try {
    const response = await apiClient.get('/entities/merge-suggestions');
    return response.data;
  } catch {
    return { suggestions: [], count: 0 };
  }
};

export const approveMerge = async (suggestionId: string) => {
  const response = await apiClient.post(`/entities/merge-suggestions/${suggestionId}/approve`);
  return response.data;
};

export const rejectMerge = async (suggestionId: string) => {
  const response = await apiClient.post(`/entities/merge-suggestions/${suggestionId}/reject`);
  return response.data;
};

// ── Contradictions ───────────────────────────────────

export const getContradictions = async (): Promise<{ contradictions: Contradiction[]; count: number }> => {
  try {
    const response = await apiClient.get('/contradictions');
    return response.data;
  } catch {
    return { contradictions: [], count: 0 };
  }
};

export const resolveContradiction = async (contradictionId: string, resolution: 'kept_a' | 'kept_b' | 'kept_both') => {
  const response = await apiClient.post(`/contradictions/${contradictionId}/resolve`, { resolution });
  return response.data;
};

// ── Analytics ────────────────────────────────────────

export const getAnalyticsOverview = async (): Promise<AnalyticsOverview | null> => {
  try {
    const response = await apiClient.get<AnalyticsOverview>('/analytics/overview');
    return response.data;
  } catch {
    return null;
  }
};

export const getCentrality = async (algorithm: string = 'pagerank', topN: number = 10): Promise<CentralityResult | null> => {
  try {
    const response = await apiClient.get<CentralityResult>('/analytics/centrality', {
      params: { algorithm, top_n: topN },
    });
    return response.data;
  } catch {
    return null;
  }
};

export const getCommunities = async (): Promise<CommunitiesResult | null> => {
  try {
    const response = await apiClient.get<CommunitiesResult>('/analytics/communities');
    return response.data;
  } catch {
    return null;
  }
};
