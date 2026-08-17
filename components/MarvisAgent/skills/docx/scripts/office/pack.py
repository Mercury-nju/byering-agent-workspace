# -*- coding: utf-8 -*-
"""Forwarding stub → skills/shared/office/pack.py"""
import os, sys, runpy  # noqa: E401
_SHARED = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "shared", "office"))
if _SHARED not in sys.path: sys.path.insert(0, _SHARED)  # noqa: E701
if __name__ == "__main__": runpy.run_path(os.path.join(_SHARED, "pack.py"), run_name="__main__")  # noqa: E701
