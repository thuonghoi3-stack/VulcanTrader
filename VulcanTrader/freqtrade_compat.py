"""Let strategies written for Freqtrade import this fork.

User strategies still say ``from freqtrade.strategy import IStrategy``.
The package was renamed to VulcanTrader, so those imports failed with
``No module named 'freqtrade'`` and the bot retried init forever.
"""

from __future__ import annotations

import importlib
import importlib.util
import sys
from importlib.abc import Loader, MetaPathFinder
from importlib.machinery import ModuleSpec


class _FreqtradeAlias(MetaPathFinder, Loader):
    def find_spec(self, fullname: str, path, target=None):  # noqa: ANN001
        if fullname != "freqtrade" and not fullname.startswith("freqtrade."):
            return None
        mapped = "VulcanTrader" + fullname[len("freqtrade"):]
        sys.meta_path.remove(self)
        try:
            origin = importlib.util.find_spec(mapped)
        except Exception:
            origin = None
        finally:
            sys.meta_path.insert(0, self)
        if origin is None:
            return None
        is_pkg = origin.submodule_search_locations is not None
        return ModuleSpec(fullname, self, origin=origin.origin, is_package=is_pkg)

    def create_module(self, spec: ModuleSpec):
        mapped = "VulcanTrader" + spec.name[len("freqtrade"):]
        sys.meta_path.remove(self)
        try:
            module = importlib.import_module(mapped)
        finally:
            sys.meta_path.insert(0, self)
        sys.modules[spec.name] = module
        if "." in spec.name:
            parent_name, child = spec.name.rsplit(".", 1)
            parent = sys.modules.get(parent_name)
            if parent is not None and not hasattr(parent, child):
                setattr(parent, child, module)
        return module

    def exec_module(self, module) -> None:  # noqa: ANN001
        return None


def install() -> None:
    if any(isinstance(finder, _FreqtradeAlias) for finder in sys.meta_path):
        return
    sys.meta_path.insert(0, _FreqtradeAlias())


install()
