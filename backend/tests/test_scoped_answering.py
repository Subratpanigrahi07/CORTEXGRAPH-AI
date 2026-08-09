"""
Automated Test Suite — Query-Scoped Answering Verification
Tests all 10 required scenarios to ensure answers are strictly scoped to requested attributes.
"""

import os
import sys
import unittest

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.schema import KnowledgeGraph, Entity, Relationship
from app.query_router import classify_query_intent, extract_query_scope, QueryIntent, AnswerScope
from app.rag import GraphRAGEngine

# Sample Candidate Knowledge Context
SAMPLE_TEXT = """
Name: Arjun Mehta
Email: arjun.mehta.dev@gmail.com
Phone: +91-9876543210
Location: Bengaluru, India
Target Role: Senior Software Engineer – AI/ML
Education: B.Tech in Computer Science, IIT Hyderabad (CGPA: 9.1/10)
Languages & Frameworks: Python, TypeScript, React, FastAPI, Neo4j, ChromaDB, PyTorch
Experience: Software Engineer at Google (2022 - Present)
Professional Summary: Experienced AI Systems Engineer building scalable Graph RAG applications.
"""

SAMPLE_GRAPH = KnowledgeGraph(
    entities=[
        Entity(id="arjun_mehta", name="Arjun Mehta", type="PERSON", properties=[]),
        Entity(id="google", name="Google", type="ORGANIZATION", properties=[]),
        Entity(id="iit_hyderabad", name="IIT Hyderabad", type="ORGANIZATION", properties=[]),
        Entity(id="fastapi", name="FastAPI", type="TECHNOLOGY", properties=[]),
        Entity(id="neo4j", name="Neo4j", type="TECHNOLOGY", properties=[]),
    ],
    relationships=[
        Relationship(source="arjun_mehta", target="google", type="WORKS_AT", properties=[]),
        Relationship(source="arjun_mehta", target="iit_hyderabad", type="STUDIED_AT", properties=[]),
    ]
)


class TestQueryScopedAnswering(unittest.TestCase):

    def setUp(self):
        self.engine = GraphRAGEngine()

    def test_01_whats_his_name(self):
        query = "What's his name?"
        intent, _ = classify_query_intent(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        scope = extract_query_scope(query, intent, SAMPLE_GRAPH, SAMPLE_TEXT)
        
        self.assertEqual(scope.answer_scope, AnswerScope.SINGLE_FACT)
        self.assertIn("name", scope.requested_attributes)
        self.assertEqual(scope.target_entity, "Arjun Mehta")

        res = self.engine.answer_query(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        self.assertIn("Arjun Mehta", res.answer)
        self.assertNotIn("arjun.mehta.dev@gmail.com", res.answer)
        self.assertNotIn("+91-9876543210", res.answer)

    def test_02_whats_his_email(self):
        query = "What's his email?"
        intent, _ = classify_query_intent(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        scope = extract_query_scope(query, intent, SAMPLE_GRAPH, SAMPLE_TEXT)

        self.assertEqual(scope.answer_scope, AnswerScope.SINGLE_FACT)
        self.assertIn("email", scope.requested_attributes)

        res = self.engine.answer_query(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        self.assertIn("arjun.mehta.dev@gmail.com", res.answer)
        self.assertNotIn("+91-9876543210", res.answer)

    def test_03_whats_his_phone_number(self):
        query = "What's his phone number?"
        intent, _ = classify_query_intent(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        scope = extract_query_scope(query, intent, SAMPLE_GRAPH, SAMPLE_TEXT)

        self.assertIn("phone", scope.requested_attributes)
        res = self.engine.answer_query(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        self.assertIn("+91-9876543210", res.answer)

    def test_04_where_does_he_live(self):
        query = "Where does he live?"
        intent, _ = classify_query_intent(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        scope = extract_query_scope(query, intent, SAMPLE_GRAPH, SAMPLE_TEXT)

        self.assertIn("location", scope.requested_attributes)
        res = self.engine.answer_query(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        self.assertIn("Bengaluru", res.answer)

    def test_05_whats_his_current_role(self):
        query = "What's his current role?"
        intent, _ = classify_query_intent(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        scope = extract_query_scope(query, intent, SAMPLE_GRAPH, SAMPLE_TEXT)

        self.assertIn("work_and_role", scope.requested_attributes)
        res = self.engine.answer_query(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        self.assertTrue("Software Engineer" in res.answer or "Google" in res.answer)

    def test_06_whats_his_name_and_email(self):
        query = "What's his name and email?"
        intent, _ = classify_query_intent(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        scope = extract_query_scope(query, intent, SAMPLE_GRAPH, SAMPLE_TEXT)

        self.assertEqual(scope.answer_scope, AnswerScope.SPECIFIC_FIELDS)
        self.assertIn("name", scope.requested_attributes)
        self.assertIn("email", scope.requested_attributes)

        res = self.engine.answer_query(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        self.assertIn("Arjun Mehta", res.answer)
        self.assertIn("arjun.mehta.dev@gmail.com", res.answer)
        self.assertNotIn("+91-9876543210", res.answer)

    def test_07_tell_me_everything_about_arjun(self):
        query = "Tell me everything about Arjun."
        intent, _ = classify_query_intent(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        scope = extract_query_scope(query, intent, SAMPLE_GRAPH, SAMPLE_TEXT)

        self.assertEqual(scope.answer_scope, AnswerScope.BROAD_SUMMARY)

    def test_08_what_technologies_does_he_know(self):
        query = "What technologies does he know?"
        intent, _ = classify_query_intent(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        scope = extract_query_scope(query, intent, SAMPLE_GRAPH, SAMPLE_TEXT)

        self.assertIn("technologies_and_skills", scope.requested_attributes)
        res = self.engine.answer_query(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        self.assertTrue("Python" in res.answer or "FastAPI" in res.answer or "React" in res.answer)

    def test_09_where_did_he_study(self):
        query = "Where did he study?"
        intent, _ = classify_query_intent(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        scope = extract_query_scope(query, intent, SAMPLE_GRAPH, SAMPLE_TEXT)

        self.assertIn("education", scope.requested_attributes)
        res = self.engine.answer_query(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        self.assertIn("IIT", res.answer)

    def test_10_what_is_his_cgpa(self):
        query = "What is his CGPA?"
        intent, _ = classify_query_intent(query, SAMPLE_GRAPH, SAMPLE_TEXT)
        scope = extract_query_scope(query, intent, SAMPLE_GRAPH, SAMPLE_TEXT)

        self.assertIn("cgpa", scope.requested_attributes)
        res = self.engine.answer_query(query, graph=SAMPLE_GRAPH, context_text=SAMPLE_TEXT, history=[])
        self.assertIn("9.1", res.answer)

    def test_11_whats_the_name(self):
        query = "What's the name?"
        res = self.engine.answer_query(query, graph=SAMPLE_GRAPH, context_text=SAMPLE_TEXT)
        self.assertEqual(res.answer.strip(), "Arjun Mehta")
        self.assertNotEqual(res.answer.strip(), "Name")

    def test_12_summary_of_education(self):
        query = "Give me the summary of the education."
        res = self.engine.answer_query(query, graph=SAMPLE_GRAPH, context_text=SAMPLE_TEXT)
        self.assertIn("B.Tech", res.answer)
        self.assertIn("IIT Hyderabad", res.answer)

    def test_13_professional_summary(self):
        query = "What's his Professional Summary?"
        res = self.engine.answer_query(query, graph=SAMPLE_GRAPH, context_text=SAMPLE_TEXT)
        self.assertIn("Experienced AI Systems Engineer", res.answer)
        self.assertNotIn("Information for", res.answer)


class TestConversationMemory(unittest.TestCase):

    def setUp(self):
        self.engine = GraphRAGEngine()

    def test_multi_turn_follow_up_flow(self):
        history = []

        # Turn 1: "What's his phone number?"
        q1 = "What's his phone number?"
        res1 = self.engine.answer_query(q1, history=history, graph=SAMPLE_GRAPH, context_text=SAMPLE_TEXT)
        self.assertIn("+91-9876543210", res1.answer)
        
        history.append({"sender": "user", "text": q1})
        history.append({"sender": "ai", "text": res1.answer})

        # Turn 2: "What are the last 4?"
        q2 = "What are the last 4?"
        res2 = self.engine.answer_query(q2, history=history, graph=SAMPLE_GRAPH, context_text=SAMPLE_TEXT)
        self.assertEqual(res2.answer.strip(), "3210")

        history.append({"sender": "user", "text": q2})
        history.append({"sender": "ai", "text": res2.answer})

        # Turn 3: "And his email?"
        q3 = "And his email?"
        res3 = self.engine.answer_query(q3, history=history, graph=SAMPLE_GRAPH, context_text=SAMPLE_TEXT)
        self.assertIn("arjun.mehta.dev@gmail.com", res3.answer)

        history.append({"sender": "user", "text": q3})
        history.append({"sender": "ai", "text": res3.answer})

        q4 = "Where does he work?"
        res4 = self.engine.answer_query(q4, history=history, graph=SAMPLE_GRAPH, context_text=SAMPLE_TEXT)
        self.assertTrue("Google" in res4.answer or "Software Engineer" in res4.answer)


class TestGeneralCasualRouting(unittest.TestCase):

    def setUp(self):
        self.engine = GraphRAGEngine()

    def test_unseen_casual_phrases(self):
        casual_queries = [
            "btw good morning",
            "morning bro",
            "hey, hope you're doing well",
            "yo what's up?",
            "appreciate it",
            "catch you later"
        ]
        for q in casual_queries:
            intent, _ = classify_query_intent(q, SAMPLE_GRAPH, SAMPLE_TEXT)
            self.assertEqual(intent, QueryIntent.CASUAL_CONVERSATION, f"Query '{q}' failed casual intent classification.")
            res = self.engine.answer_query(q, graph=SAMPLE_GRAPH, context_text=SAMPLE_TEXT)
            self.assertNotIn("I'm here to help! What would you like to know or explore today?", res.answer)
            self.assertTrue(len(res.answer.strip()) > 0)


if __name__ == '__main__':
    unittest.main()
