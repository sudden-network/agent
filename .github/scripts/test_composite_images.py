import unittest

import yaml

from check_composite_images import violations


class CompositeImagesTest(unittest.TestCase):
    def test_rejects_mutable_and_incomplete_digests(self):
        for reference in [
            "docker://alpine",
            "docker://alpine:latest",
            "docker://alpine:3.22",
            "docker://alpine@sha256:1234",
            "docker://alpine@sha256:" + "g" * 64,
        ]:
            with self.subTest(reference=reference):
                self.assertEqual(len(violations(self.action(reference))), 1)

    def test_accepts_digest_and_other_action_types(self):
        for reference in [
            "docker://alpine@sha256:" + "a" * 64,
            "docker://registry.example:5000/alpine:3.22@sha256:" + "a" * 64,
            "./local-action",
            "actions/checkout@" + "a" * 40,
        ]:
            with self.subTest(reference=reference):
                self.assertEqual(violations(self.action(reference)), [])

    def test_yaml_alias_and_folded_scalar(self):
        source = """runs:
  using: composite
  steps:
    - &image
      uses: >-
        docker://alpine:latest
    - *image
"""
        self.assertEqual(len(violations(source)), 2)

    def test_ignores_run_steps_and_other_action_kinds(self):
        self.assertEqual(violations("runs: {using: composite, steps: [{run: echo ok}]}"), [])
        self.assertEqual(violations("runs: {using: node24, main: index.js}"), [])

    def test_malformed_yaml_fails(self):
        with self.assertRaises(yaml.YAMLError):
            violations("runs: [invalid")

    @staticmethod
    def action(reference):
        return yaml.safe_dump({"runs": {"using": "composite", "steps": [{"uses": reference}]}})


if __name__ == "__main__":
    unittest.main()
