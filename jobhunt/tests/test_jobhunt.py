import json
import tempfile
import unittest
from pathlib import Path

from jobhunt.__main__ import main
from jobhunt.models import Job
from jobhunt.profile import load_profile, weight_by_cv
from jobhunt.scoring import dedupe, score_job
from jobhunt.sources import adzuna, reed, remotive

ROOT = Path(__file__).resolve().parent.parent
PROFILE = load_profile(ROOT / "profile.toml")


def job(title, desc="", company="Acme", source="reed", **kw):
    return Job(source=source, source_id="1", title=title, company=company, location="Birmingham",
               url="https://example.com", description=desc, **kw)


class ParseTests(unittest.TestCase):
    def test_reed(self):
        [j] = reed.parse({"results": [{"jobId": 5, "jobTitle": "Junior DevOps Engineer", "employerName": "Acme",
                                       "locationName": "Birmingham", "minimumSalary": 32000, "maximumSalary": 38000,
                                       "date": "20/10/2026", "jobDescription": "<p>Terraform &amp; AWS</p>",
                                       "jobUrl": "https://reed.co.uk/jobs/5"}]})
        self.assertEqual((j.posted, j.description, j.salary_text), ("2026-10-20", "Terraform & AWS", "£32,000–£38,000"))

    def test_adzuna(self):
        [j] = adzuna.parse({"results": [{"id": "9", "title": "<strong>Cloud</strong> Engineer",
                                         "company": {"display_name": "Beta"}, "location": {"display_name": "Solihull"},
                                         "created": "2026-10-21T09:00:00Z", "redirect_url": "https://adzuna/9"}]})
        self.assertEqual((j.title, j.company, j.posted), ("Cloud Engineer", "Beta", "2026-10-21"))

    def test_remotive_drops_non_uk(self):
        jobs = remotive.parse({"jobs": [
            {"id": 1, "title": "SRE", "candidate_required_location": "USA only"},
            {"id": 2, "title": "DevOps", "candidate_required_location": "UK"},
            {"id": 3, "title": "Cloud", "candidate_required_location": "Worldwide"},
        ]})
        self.assertEqual([j.source_id for j in jobs], ["2", "3"])


class ScoringTests(unittest.TestCase):
    def test_junior_beats_senior(self):
        desc = "AWS, Terraform, Docker and GitHub Actions CI/CD"
        junior = score_job(job("Junior DevOps Engineer", desc), PROFILE)
        senior = score_job(job("Senior DevOps Engineer", desc), PROFILE)
        self.assertGreater(junior.score, senior.score + 30)

    def test_excluded_title(self):
        self.assertEqual(score_job(job("1st Line Helpdesk Analyst"), PROFILE).score, -100)

    def test_years_penalty(self):
        base = score_job(job("Cloud Engineer", "AWS"), PROFILE).score
        heavy = score_job(job("Cloud Engineer", "AWS. 7+ years experience required"), PROFILE).score
        self.assertEqual(base - heavy, 15)

    def test_low_pay_penalty(self):
        ok = score_job(job("Cloud Engineer", salary_max=40000), PROFILE).score
        low = score_job(job("Cloud Engineer", salary_max=28000), PROFILE).score
        self.assertEqual(ok - low, 15)

    def test_skill_word_boundaries(self):
        # "git" must not match inside "digital"
        j = score_job(job("Infrastructure Engineer", "digital transformation"), PROFILE)
        self.assertFalse(any("git" in r for r in j.reasons))

    def test_dedupe_across_boards(self):
        a = job("Junior Cloud Engineer", company="Acme Ltd", source="reed")
        b = job("Junior Cloud Engineer ", company="ACME", source="adzuna", salary_max=40000)
        [m] = dedupe([a, b])
        self.assertEqual((m.also_on, m.salary_max), (["adzuna"], 40000))


class CvTests(unittest.TestCase):
    def test_unmentioned_skills_capped(self):
        w = weight_by_cv({"terraform": 5, "kubernetes": 3}, "Built Terraform modules. Terraform state in S3.")
        self.assertGreater(w["terraform"], 5)
        self.assertEqual(w["kubernetes"], 1)


class EndToEndTests(unittest.TestCase):
    def test_from_json_marks_new_then_seen(self):
        with tempfile.TemporaryDirectory() as d:
            raw = Path(d, "raw.json")
            raw.write_text(json.dumps([job("Junior DevOps Engineer", "AWS Terraform Docker").__dict__]))
            args = ["--profile", str(ROOT / "profile.toml"), "--from-json", str(raw), "--out", d]
            main(args)
            self.assertIn("🆕 [Junior", Path(d, "report.md").read_text())
            main(args)
            self.assertNotIn("🆕 [Junior", Path(d, "report.md").read_text())


if __name__ == "__main__":
    unittest.main()
