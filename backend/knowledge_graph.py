"""
Knowledge Graph module.
Parses Python and Java source files to build an interactive knowledge graph
showing project structure, imports, classes, functions, and their relationships.
"""

import os
import ast
import json
from pathlib import Path
from typing import Optional

import networkx as nx

# Try importing javalang for Java parsing
try:
    import javalang
    JAVA_SUPPORT = True
except ImportError:
    JAVA_SUPPORT = False


def parse_python_file(filepath: str, rel_path: str) -> dict:
    """
    Parse a Python file using the ast module to extract structure.
    
    Returns:
        dict with classes, functions, imports, and relationships
    """
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            source = f.read()
        
        tree = ast.parse(source, filename=rel_path)
    except (SyntaxError, ValueError):
        return {"error": f"Cannot parse {rel_path}", "classes": [], "functions": [], "imports": []}
    
    classes = []
    functions = []
    imports = []
    calls = []
    
    for node in ast.walk(tree):
        # Extract imports
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append({
                    "module": alias.name,
                    "alias": alias.asname,
                    "type": "import"
                })
        
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                imports.append({
                    "module": module,
                    "name": alias.name,
                    "alias": alias.asname,
                    "type": "from_import"
                })
        
        # Extract class definitions
        elif isinstance(node, ast.ClassDef):
            bases = []
            for base in node.bases:
                if isinstance(base, ast.Name):
                    bases.append(base.id)
                elif isinstance(base, ast.Attribute):
                    bases.append(ast.dump(base))
            
            methods = []
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    methods.append({
                        "name": item.name,
                        "line": item.lineno,
                        "args": len(item.args.args),
                        "is_async": isinstance(item, ast.AsyncFunctionDef)
                    })
            
            classes.append({
                "name": node.name,
                "line": node.lineno,
                "bases": bases,
                "methods": methods,
                "method_count": len(methods)
            })
        
        # Extract top-level functions
        elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
            # Only top-level (not methods inside classes)
            functions.append({
                "name": node.name,
                "line": node.lineno,
                "args": len(node.args.args),
                "is_async": isinstance(node, ast.AsyncFunctionDef)
            })
        
        # Extract function calls for dependency tracking
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                calls.append(node.func.id)
            elif isinstance(node.func, ast.Attribute):
                calls.append(node.func.attr)
    
    return {
        "file": rel_path,
        "language": "python",
        "classes": classes,
        "functions": functions,
        "imports": imports,
        "calls": list(set(calls)),
        "line_count": len(source.splitlines())
    }


def parse_java_file(filepath: str, rel_path: str) -> dict:
    """
    Parse a Java file using javalang to extract structure.
    """
    if not JAVA_SUPPORT:
        return {"error": "javalang not installed", "classes": [], "functions": [], "imports": []}
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            source = f.read()
        
        tree = javalang.parse.parse(source)
    except (javalang.parser.JavaSyntaxError, Exception):
        return {"error": f"Cannot parse {rel_path}", "classes": [], "functions": [], "imports": []}
    
    classes = []
    functions = []
    imports = []
    package_name = ""
    
    # Package
    if tree.package:
        package_name = tree.package.name
    
    # Imports
    for imp in tree.imports or []:
        imports.append({
            "module": imp.path,
            "type": "import",
            "is_static": imp.static,
            "is_wildcard": imp.wildcard
        })
    
    # Classes and interfaces
    for path, node in tree.filter(javalang.tree.ClassDeclaration):
        methods = []
        if node.body:
            for member in node.body:
                if isinstance(member, javalang.tree.MethodDeclaration):
                    methods.append({
                        "name": member.name,
                        "return_type": member.return_type.name if member.return_type else "void",
                        "params": len(member.parameters) if member.parameters else 0
                    })
        
        extends = []
        if node.extends:
            extends.append(node.extends.name if hasattr(node.extends, 'name') else str(node.extends))
        
        implements = []
        if node.implements:
            for iface in node.implements:
                implements.append(iface.name if hasattr(iface, 'name') else str(iface))
        
        classes.append({
            "name": node.name,
            "methods": methods,
            "method_count": len(methods),
            "extends": extends,
            "implements": implements,
            "modifiers": list(node.modifiers) if node.modifiers else []
        })
    
    # Interfaces
    for path, node in tree.filter(javalang.tree.InterfaceDeclaration):
        methods = []
        if node.body:
            for member in node.body:
                if isinstance(member, javalang.tree.MethodDeclaration):
                    methods.append({
                        "name": member.name,
                        "return_type": member.return_type.name if member.return_type else "void",
                        "params": len(member.parameters) if member.parameters else 0
                    })
        
        classes.append({
            "name": node.name,
            "methods": methods,
            "method_count": len(methods),
            "extends": [],
            "implements": [],
            "modifiers": list(node.modifiers) if node.modifiers else [],
            "is_interface": True
        })
    
    return {
        "file": rel_path,
        "language": "java",
        "package": package_name,
        "classes": classes,
        "functions": functions,
        "imports": imports,
        "line_count": len(source.splitlines())
    }


def build_knowledge_graph(repo_path: str) -> dict:
    """
    Build a knowledge graph from all code files in a repository.
    
    Returns:
        dict with 'nodes' and 'links' arrays suitable for force-graph rendering,
        plus 'stats' with summary metrics.
    """
    G = nx.DiGraph()
    
    skip_dirs = {'.git', '__pycache__', 'node_modules', '.venv', 'venv', 'env',
                 '.eggs', '.tox', 'build', 'dist', '.idea', '.vscode'}
    
    parsed_files = []
    
    # Parse all files
    for root, dirs, filenames in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in skip_dirs and not d.startswith('.')]
        
        for filename in filenames:
            filepath = os.path.join(root, filename)
            rel_path = os.path.relpath(filepath, repo_path).replace("\\", "/")
            ext = os.path.splitext(filename)[1].lower()
            
            if ext == '.py':
                parsed = parse_python_file(filepath, rel_path)
                parsed_files.append(parsed)
            elif ext == '.java':
                parsed = parse_java_file(filepath, rel_path)
                parsed_files.append(parsed)
    
    # Build graph nodes and edges
    nodes = []
    links = []
    node_ids = set()
    
    # Create module/package nodes from directory structure
    dirs_seen = set()
    for parsed in parsed_files:
        if "error" in parsed and not parsed.get("classes"):
            continue
        
        rel_path = parsed["file"]
        parts = rel_path.split("/")
        
        # Add directory nodes
        for i in range(len(parts) - 1):
            dir_path = "/".join(parts[:i+1])
            if dir_path not in dirs_seen:
                dirs_seen.add(dir_path)
                node_id = f"dir:{dir_path}"
                if node_id not in node_ids:
                    nodes.append({
                        "id": node_id,
                        "label": parts[i],
                        "type": "module",
                        "fullPath": dir_path
                    })
                    node_ids.add(node_id)
                
                # Link to parent directory
                if i > 0:
                    parent_dir = "/".join(parts[:i])
                    parent_id = f"dir:{parent_dir}"
                    links.append({
                        "source": parent_id,
                        "target": node_id,
                        "type": "contains"
                    })
        
        # Add file node
        file_id = f"file:{rel_path}"
        language = parsed.get("language", "unknown")
        nodes.append({
            "id": file_id,
            "label": os.path.basename(rel_path),
            "type": "file",
            "language": language,
            "lineCount": parsed.get("line_count", 0)
        })
        node_ids.add(file_id)
        
        # Link file to parent directory
        if len(parts) > 1:
            parent_dir = "/".join(parts[:-1])
            parent_id = f"dir:{parent_dir}"
            links.append({
                "source": parent_id,
                "target": file_id,
                "type": "contains"
            })
        
        # Add class nodes
        for cls in parsed.get("classes", []):
            cls_id = f"class:{rel_path}:{cls['name']}"
            nodes.append({
                "id": cls_id,
                "label": cls["name"],
                "type": "class",
                "methodCount": cls.get("method_count", 0),
                "language": language
            })
            node_ids.add(cls_id)
            
            # File contains class
            links.append({
                "source": file_id,
                "target": cls_id,
                "type": "contains"
            })
            
            # Inheritance edges
            for base in cls.get("bases", []) + cls.get("extends", []):
                # Try to find the base class in our graph
                base_id = f"class_ref:{base}"
                if base_id not in node_ids:
                    nodes.append({
                        "id": base_id,
                        "label": base,
                        "type": "class",
                        "external": True,
                        "language": language
                    })
                    node_ids.add(base_id)
                links.append({
                    "source": cls_id,
                    "target": base_id,
                    "type": "inherits"
                })
            
            # Interface implementation edges
            for iface in cls.get("implements", []):
                iface_id = f"class_ref:{iface}"
                if iface_id not in node_ids:
                    nodes.append({
                        "id": iface_id,
                        "label": iface,
                        "type": "class",
                        "external": True,
                        "language": language
                    })
                    node_ids.add(iface_id)
                links.append({
                    "source": cls_id,
                    "target": iface_id,
                    "type": "implements"
                })
            
            # Add method nodes for classes with methods
            for method in cls.get("methods", []):
                method_id = f"func:{rel_path}:{cls['name']}.{method['name']}"
                nodes.append({
                    "id": method_id,
                    "label": f"{method['name']}()",
                    "type": "function",
                    "language": language
                })
                node_ids.add(method_id)
                links.append({
                    "source": cls_id,
                    "target": method_id,
                    "type": "contains"
                })
        
        # Add top-level function nodes
        for func in parsed.get("functions", []):
            func_id = f"func:{rel_path}:{func['name']}"
            nodes.append({
                "id": func_id,
                "label": f"{func['name']}()",
                "type": "function",
                "language": language
            })
            node_ids.add(func_id)
            links.append({
                "source": file_id,
                "target": func_id,
                "type": "contains"
            })
        
        # Add import edges (file-to-file)
        for imp in parsed.get("imports", []):
            module = imp.get("module", "")
            if module:
                # Try to resolve module to a file in the project
                possible_path = module.replace(".", "/") + ".py"
                target_file_id = f"file:{possible_path}"
                
                if target_file_id in node_ids:
                    links.append({
                        "source": file_id,
                        "target": target_file_id,
                        "type": "imports"
                    })
                else:
                    # External dependency
                    ext_id = f"ext:{module}"
                    if ext_id not in node_ids:
                        nodes.append({
                            "id": ext_id,
                            "label": module,
                            "type": "external",
                            "language": language
                        })
                        node_ids.add(ext_id)
                    links.append({
                        "source": file_id,
                        "target": ext_id,
                        "type": "imports"
                    })
    
    # Calculate stats
    stats = {
        "total_files": sum(1 for n in nodes if n["type"] == "file"),
        "total_classes": sum(1 for n in nodes if n["type"] == "class" and not n.get("external")),
        "total_functions": sum(1 for n in nodes if n["type"] == "function"),
        "total_modules": sum(1 for n in nodes if n["type"] == "module"),
        "total_imports": sum(1 for l in links if l["type"] == "imports"),
        "total_nodes": len(nodes),
        "total_edges": len(links),
        "python_files": sum(1 for n in nodes if n["type"] == "file" and n.get("language") == "python"),
        "java_files": sum(1 for n in nodes if n["type"] == "file" and n.get("language") == "java"),
    }
    
    return {
        "nodes": nodes,
        "links": links,
        "stats": stats
    }
