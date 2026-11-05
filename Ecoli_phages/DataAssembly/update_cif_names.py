#!/usr/bin/env python3
"""
update_cif_names.py

Updates chain entity descriptions in AlphaFold3 .cif files:
  - Receptor entity -> "RECEPTOR: <Receptor_Name>" (e.g. "RECEPTOR: Tsx")
  - RBP entity      -> "RBP: <RBP_LocusID>" (e.g. "RBP: OQAVUALE_CDS_0084")

Includes double-checking verification of amino acid sequence lengths between:
  - CIF model chains
  - Phage genome GBK CDS translations (for RBPs)
  - Bacterial host reference sequences (for Receptors)

Usage:
  python3 update_cif_names.py [--dry-run] [--backup]
"""

import os
import re
import glob
import argparse
import pandas as pd

# Standard 3-to-1 amino acid dictionary
D3TO1 = {
    'ALA': 'A', 'ARG': 'R', 'ASN': 'N', 'ASP': 'D', 'CYS': 'C',
    'GLU': 'E', 'GLN': 'Q', 'GLY': 'G', 'HIS': 'H', 'ILE': 'I',
    'LEU': 'L', 'LYS': 'K', 'MET': 'M', 'PHE': 'F', 'PRO': 'P',
    'SER': 'S', 'THR': 'T', 'TRP': 'W', 'TYR': 'Y', 'VAL': 'V',
    'SEC': 'U', 'PYL': 'O'
}

# Known bacterial receptor protein lengths (mature/full BW25113 reference)
RECEPTOR_REF_LENGTHS = {
    'tsx': 294,
    'ompf': 362,
    'ompa': 346,
    'ompc': 367,
    'fhua': 747,
    'btub': 614,
    'lptd': 784,
    'lamb': 446,
    'tolc': 493,
    'nupg': 418,
    'yncd': 700,
    'fadl': 448
}

def load_keio_receptors(genes_tab_path, aaseq_path):
    """Load receptor gene lengths from Keio barseq data if available."""
    rec_lens = dict(RECEPTOR_REF_LENGTHS)
    if os.path.exists(genes_tab_path) and os.path.exists(aaseq_path):
        try:
            genes_df = pd.read_csv(genes_tab_path, sep='\t')
            with open(aaseq_path) as f:
                aaseq_text = f.read()

            seq_map = {}
            for entry in aaseq_text.split('>'):
                if not entry.strip():
                    continue
                lines = entry.strip().splitlines()
                seq_map[lines[0].strip()] = len(''.join(lines[1:]))

            for _, row in genes_df.iterrows():
                name = str(row.get('name', '')).lower()
                lid = str(row.get('locusId', ''))
                if name and lid in seq_map:
                    rec_lens[name] = seq_map[lid]
        except Exception as e:
            print(f"[Warning] Could not load Keio aaseq: {e}. Falling back to default reference lengths.")
    return rec_lens

def get_rbp_translation(gbk_path, rbp_id):
    """Extract translated amino acid sequence for a given CDS locus tag from a GenBank file."""
    if not os.path.exists(gbk_path):
        return None
    with open(gbk_path, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()

    # Search by locus_tag or ID qualifier
    pattern = rf'/(?:locus_tag|ID)=\"?{re.escape(rbp_id)}\"?.*?/translation=\"([A-Za-z\s]+)\"'
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return re.sub(r'\s+', '', match.group(1))

    # Fallback search if formatted with equals
    pattern_alt = rf'ID={re.escape(rbp_id)}.*?translation=([A-Za-z\s]+)'
    match_alt = re.search(pattern_alt, text, re.DOTALL)
    if match_alt:
        return re.sub(r'\s+', '', match_alt.group(1))

    return None

def parse_cif_entities_and_strands(cif_text):
    """
    Parses _entity and _entity_poly blocks from a CIF file.
    Returns:
      entity_ids: list of entity ID strings
      strands: list of (entity_id, strand_id) tuples
      entity_lengths: dict mapping entity_id -> residue count
    """
    # Parse entity_poly strands: (entity_id, strand_id)
    strands = re.findall(r'(\d+)\s+([A-Z])\s+polypeptide', cif_text)

    # Parse entity residue counts from _entity_poly_seq
    entity_lengths = {}
    for entity_id, _ in strands:
        if entity_id not in entity_lengths:
            matches = re.findall(rf'^{entity_id}\s+n\s+[A-Z]{{3}}\s+\d+', cif_text, re.MULTILINE)
            entity_lengths[entity_id] = len(matches)

    # Get unique entity IDs in order
    entity_ids = []
    for entity_id, _ in strands:
        if entity_id not in entity_ids:
            entity_ids.append(entity_id)

    return entity_ids, strands, entity_lengths

def update_cif_file(cif_path, receptor_name, rbp_locus_id, out_path=None, dry_run=False):
    """
    Reads the original CIF file and writes an updated version with renamed
    entity descriptions to out_path (defaults to '<name>_renamed.cif'), leaving
    the original CIF file intact.
    """
    if out_path is None:
        out_path = re.sub(r'(_renamed)?\.cif$', '_renamed.cif', cif_path)

    with open(cif_path, 'r', encoding='utf-8') as f:
        cif_text = f.read()

    entity_ids, strands, entity_lengths = parse_cif_entities_and_strands(cif_text)
    if not entity_ids:
        return False, "Could not parse entity definitions in CIF"

    total_entities = len(entity_ids)
    entity_desc_map = {}

    if total_entities == 2:
        entity_desc_map[entity_ids[0]] = f"RECEPTOR: {receptor_name}"
        entity_desc_map[entity_ids[1]] = f"RBP: {rbp_locus_id}"
    elif total_entities == 4:
        # Check lengths or receptor to see if 3 REC + 1 RBP or 1 REC + 3 RBP
        if receptor_name.lower() == 'ompf':
            for eid in entity_ids[:3]:
                entity_desc_map[eid] = f"RECEPTOR: {receptor_name}"
            entity_desc_map[entity_ids[3]] = f"RBP: {rbp_locus_id}"
        else:
            entity_desc_map[entity_ids[0]] = f"RECEPTOR: {receptor_name}"
            for eid in entity_ids[1:]:
                entity_desc_map[eid] = f"RBP: {rbp_locus_id}"
    elif total_entities == 6:
        for eid in entity_ids[:3]:
            entity_desc_map[eid] = f"RECEPTOR: {receptor_name}"
        for eid in entity_ids[3:]:
            entity_desc_map[eid] = f"RBP: {rbp_locus_id}"
    else:
        # Default: first is receptor, remaining are RBP
        entity_desc_map[entity_ids[0]] = f"RECEPTOR: {receptor_name}"
        for eid in entity_ids[1:]:
            entity_desc_map[eid] = f"RBP: {rbp_locus_id}"

    # Match old _entity loop block
    entity_block_match = re.search(
        r'(loop_\s*\n_entity\.id\s*\n_entity\.pdbx_description\s*\n_entity\.type\s*\n)(.*?\n)(?=#|\n\n)',
        cif_text,
        re.DOTALL
    )

    if not entity_block_match:
        return False, "Could not locate standard loop_ _entity block in CIF"

    header = entity_block_match.group(1)
    new_rows = []
    for eid in entity_ids:
        desc = entity_desc_map.get(eid, ".")
        new_rows.append(f'{eid} "{desc}" polymer ')

    new_entity_block = header + "\n".join(new_rows) + " \n"
    modified_text = cif_text[:entity_block_match.start()] + new_entity_block + cif_text[entity_block_match.end():]

    if not dry_run:
        with open(out_path, 'w', encoding='utf-8') as f_out:
            f_out.write(modified_text)

    return True, entity_desc_map

def main():
    parser = argparse.ArgumentParser(description="Update entity descriptions in AlphaFold3 CIF models to '<name>_renamed.cif', keeping originals intact.")
    parser.add_argument('--cif-dir', default='Ecoli_phages/data/AlphaFold_models', help="Directory containing .cif files")
    parser.add_argument('--metadata', default='Ecoli_phages/data/Table_S1_updated.tsv', help="Path to Table_S1 TSV")
    parser.add_argument('--gbk-dir', default='Ecoli_phages/data/phage_genomes', help="Directory of phage GenBank files")
    parser.add_argument('--keio-genes', default='Ecoli_phages/barseq_browser/data/Keio/genes_w_ecocyc.tab', help="Path to Keio genes table")
    parser.add_argument('--keio-aaseq', default='Ecoli_phages/barseq_browser/data/Keio/aaseq', help="Path to Keio aaseq")
    parser.add_argument('--dry-run', action='store_true', help="Perform validation without writing changes")
    args = parser.parse_args()

    print(f"=== AlphaFold3 CIF Entity Renamer & Sequence Length Verifier ===")
    print(f"Mode: {'DRY RUN (no files modified)' if args.dry_run else 'APPLYING UPDATES (writing to *_renamed.cif, keeping originals intact)'}")
    print(f"Metadata: {args.metadata}")
    print(f"CIF Directory: {args.cif_dir}\n")

    if not os.path.exists(args.metadata):
        raise FileNotFoundError(f"Metadata file not found: {args.metadata}")

    df = pd.read_csv(args.metadata, sep='\t')
    rec_ref_lengths = load_keio_receptors(args.keio_genes, args.keio_aaseq)

    cif_pattern = os.path.join(args.cif_dir, "*.cif")
    # Only process original CIF files, not previously generated _renamed.cif files
    cif_files = sorted([f for f in glob.glob(cif_pattern) if not f.endswith("_renamed.cif")])

    if not cif_files:
        print(f"[!] No CIF files found in {args.cif_dir}")
        return

    print(f"Found {len(cif_files)} CIF files to process.\n")

    report = []
    stats = {
        'total': len(cif_files),
        'updated': 0,
        'skipped_no_metadata': 0,
        'failed': 0,
        'rec_len_match': 0,
        'rec_len_diff': 0,
        'rbp_len_match': 0,
        'rbp_len_diff': 0,
        'rbp_not_in_gbk': 0
    }

    for cif_path in cif_files:
        fname = os.path.basename(cif_path)
        m = re.match(r'fold_([a-z0-9]+)_(.*?)_model_0\.cif', fname)
        if not m:
            print(f"[-] Skipping non-standard filename: {fname}")
            continue

        rec_name_file, phage_name_file = m.groups()

        # Match phage directly to metadata
        matches = df[df['Phage'].str.lower() == phage_name_file.lower()]
        if len(matches) == 0:
            print(f"[!] No metadata match for phage: {phage_name_file} ({fname})")
            stats['skipped_no_metadata'] += 1
            # Ensure stale _renamed.cif is not kept for un-matched models
            renamed_path = re.sub(r'(_renamed)?\.cif$', '_renamed.cif', cif_path)
            if not args.dry_run and os.path.exists(renamed_path):
                os.remove(renamed_path)
            continue

        actual_phage = matches.iloc[0]['Phage']
        row = matches.iloc[0]

        # Determine receptor name and RBP locus tag
        rec_col = str(row.get('BW25113 receptor', rec_name_file)).split(';')[0].strip()
        rbp_col = str(row.get('Receptor-binding protein', 'Unknown_RBP')).split(';')[0].strip()

        receptor_name = rec_col if rec_col not in ['N/A', '', 'Unknown'] else rec_name_file.upper()

        # Read CIF and parse lengths
        with open(cif_path, 'r', encoding='utf-8') as f:
            cif_text = f.read()

        entity_ids, strands, entity_lengths = parse_cif_entities_and_strands(cif_text)
        cif_rec_len = entity_lengths.get('1', 0)
        cif_rbp_len = entity_lengths.get(entity_ids[-1], 0)

        # --- Double-check 1: Receptor sequence length ---
        exp_rec_len = rec_ref_lengths.get(receptor_name.lower())
        rec_status = "MATCH"
        if exp_rec_len is not None:
            if exp_rec_len == cif_rec_len:
                stats['rec_len_match'] += 1
            else:
                stats['rec_len_diff'] += 1
                rec_status = f"DIFF (exp={exp_rec_len}, cif={cif_rec_len})"
        else:
            rec_status = f"UNKNOWN_REF (cif={cif_rec_len})"

        # --- Double-check 2: Phage RBP sequence length ---
        gbk_path = os.path.join(args.gbk_dir, f"{actual_phage}.gbk")
        rbp_seq = get_rbp_translation(gbk_path, rbp_col)
        rbp_status = "MATCH"
        if rbp_seq:
            exp_rbp_len = len(rbp_seq)
            if exp_rbp_len == cif_rbp_len:
                stats['rbp_len_match'] += 1
            else:
                stats['rbp_len_diff'] += 1
                rbp_status = f"DIFF (gbk={exp_rbp_len}, cif={cif_rbp_len})"
        else:
            stats['rbp_not_in_gbk'] += 1
            rbp_status = f"NO_GBK_TRANS (cif={cif_rbp_len})"

        # --- Apply CIF description update to _renamed.cif ---
        success, desc_or_err = update_cif_file(
            cif_path, receptor_name, rbp_col,
            dry_run=args.dry_run
        )

        if success:
            stats['updated'] += 1
            rec_tag = desc_or_err.get('1', f'RECEPTOR: {receptor_name}')
            rbp_tag = desc_or_err.get(entity_ids[-1], f'RBP: {rbp_col}')
            report.append({
                'file': fname,
                'phage': actual_phage,
                'receptor': rec_tag,
                'rec_check': rec_status,
                'rbp': rbp_tag,
                'rbp_check': rbp_status,
                'chains': len(strands)
            })
        else:
            stats['failed'] += 1
            print(f"[Error] Failed updating {fname}: {desc_or_err}")

    # Summary report
    print("\n" + "="*80)
    print(f"VERIFICATION & UPDATE SUMMARY")
    print("="*80)
    print(f"Total CIF models inspected:       {stats['total']}")
    print(f"Successfully processed:           {stats['updated']}")
    print(f"Skipped (no metadata match):      {stats['skipped_no_metadata']}")
    if stats['failed']:
        print(f"Failed to process:                {stats['failed']}")
    print(f"\n--- Sequence Length Double-Checks ---")
    print(f"Receptor length exact matches:     {stats['rec_len_match']} / {stats['updated']}")
    if stats['rec_len_diff']:
        print(f"Receptor length discrepancies:    {stats['rec_len_diff']}")
    print(f"RBP length exact matches:          {stats['rbp_len_match']} / {stats['updated']}")
    if stats['rbp_len_diff']:
        print(f"RBP length discrepancies:         {stats['rbp_len_diff']} (e.g. folded trimer/domain vs tip adhesin)")
    if stats['rbp_not_in_gbk']:
        print(f"RBP locus tag unparsed in GBK:    {stats['rbp_not_in_gbk']}")

    # Print sample of discrepancies if any
    diffs = [r for r in report if 'DIFF' in r['rec_check'] or 'DIFF' in r['rbp_check']]
    if diffs:
        print("\n--- Discrepancies Flagged for Review (Length Differences) ---")
        for d in diffs:
            print(f"{d['file']:35} | Rec Check: {d['rec_check']:22} | RBP Check: {d['rbp_check']:25}")

    print("\n" + "="*80)
    print(f"Execution complete. {'(DRY RUN - files were not changed)' if args.dry_run else 'CIF files successfully updated on disk!'}")
    print("="*80)

if __name__ == '__main__':
    main()
