## Data browser for Moriniere et al. 2026

This is a browser for exploring and understanding the data from [this paper](https://www.biorxiv.org/content/10.64898/2026.04.02.716166v1) on E. coli phages. The browser is live here: https://iseq.lbl.gov/PhageDataSheets/Ecoli_phages/

The home page shows all the phages in a table and a vcontact-derived network diagram, and let's the user filter or search for phage with particular characteristics. It also let's the user click on particular phage to see more info, including the annotated genome, efficiency of plating on relevant knockouts, and an AlphaFold3 model of the receptor binding domain and receptor when possible.

The data sources for this browser are:
1. Phage metadata, compiled by Lucas Moriniere based on RB-TnSeq, EOP data, and manual curation (Table_S1_Phages.tsv)
2. Raw EOP data (KEIO_EOP_reformatted.csv)
3. A vcontact network of the phage in this study, along with a larger set of phage from NCBI (c1_new.ntw, network_edges.csv, network_node.csv)
4. Phage genomes for each phage
5. AlphaFold models for each phage

This browser additionally links to an RB-TnSeq and DubSeq genome browser, which let's users look at the raw and processed data across the genome for any phages they are interested in. We focus here on the BW25113 RB-TnSeq data, since it is the most informative, but browsers are available for BL21 RB-TnSeq data and BW25113 DubSeq data.

The data sources for these are:
1. Metadata on the RB-TnSeq experiments (RBTnseq_sets.csv)
2. Metadata on the DubSeq experiments (Dubseq_sets.csv)
3. Genome files for BW25113 and BL21 (fasta, gene table, amino acid sequences)
4. RB-TnSeq data per gene per experiment (RBTnSeq.feather)
5. DubSeq data per gene per experiment (DubSeq.feather)

This browser also queries for additional data on the server:
1. DubSeq counts for each fragment (DubSeq_counts.parquet)
2. DubSeq scores (scaled log2-fold-change) for each fragment (DubSeq_scores.parquet)
3. RB-TnSeq counts for each barcode/insertion (strain_counts.parquet)
4. RB-TnSeq scores (scaled log2-fold-change) for each barcode/insertion (strain_counts.parquet)