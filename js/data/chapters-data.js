/* Shipped with the app (v1.38). This used to be fetched from a public CDN and run as code; it is now a normal
   same-origin file, so a private content repo and a strict CSP both work. Refresh it from Drive with
   `node tools/update-chapters.js <downloaded chapters-data.js>`, then deploy. */
/* ══════════════════════════════════════════════════════════════════════
   CHAPTERS-DATA.JS — ABHYAS AUTO-GENERATED
   ──────────────────────────────────────────────────────────────────────
   Four-level shape:  level -> chapter -> subtopic -> file(s)

   Every chapter ends with:
     • '<prefix>.<N+1> Mixed Questions'    — pooled unclassified, part N
     • '<prefix>.<N+2> Original Questions' — every unique source file

   Classified subtopics use leaves 'All' or 'part N'.
   Mixed Questions uses 'part 1', 'part 2', …
   Original Questions:
     – L5 / L7 : '<Book>.<range>'         e.g. 'DPARSAD.1-100'
     – GK      : '<topic>'                e.g. 'constitution'
   Empty Mixed/Original buckets are omitted entirely.
   ══════════════════════════════════════════════════════════════════════ */

const CH_NAMES = {
  "gk": {
    "1": "General Awareness",
    "2": "Management",
    "3": "IQ"
  },
  "level5": {
    "1": "Surveying",
    "2": "Construction Materials",
    "3": "Mechanics of Materials and Structures",
    "4": "Hydraulics",
    "5": "Soil Mechanics",
    "6": "Structural Design",
    "7": "Building Construction Technology",
    "8": "Water Supply and Sanitation",
    "9": "Irrigation Engineering",
    "10": "Highway Engineering",
    "11": "Estimating and Costing",
    "12": "Construction Management",
    "13": "Airport Engineering"
  },
  "level7": {
    "1": "Structural Engineering",
    "2": "Engineering Survey",
    "3": "Construction Materials",
    "4": "Concrete Technology",
    "5": "Geotechnical Engineering",
    "6": "Construction Management",
    "7": "Estimating & Costing",
    "8": "Engineering Drawing",
    "9": "Engineering Economics",
    "10": "Professional Practices"
  }
};

const LEVEL_LABELS = {
  "gk": "General Knowledge (shared)",
  "level5": "Level 5 — Diploma",
  "level7": "Level 7 — Engineering"
};

const DRIVE = {
  "gk": {
    "1": {
      "1.1 GEO&DEMO": {
        "All": "1CJHlW5OLb6Brs52WVc1jX9sXKVaw6Bpr"
      },
      "1.10 CURRENT AFFAIRS": {
        "All": "15p9nd3Rq7612uipaR6ZftEihK1Nb3NBM"
      },
      "1.2 NAT RESOURCES": {
        "All": "1c_lCxhKXSnOGl6S5bzanGKla7m1qGsvP"
      },
      "1.3 PERIODIC PLAN": {
        "part 1": "1JWsgGBpSpuL7LX0xiP1hh8ps_Pxo-PQu",
        "part 2": "1NdctYm3Lwotg3Ia1ke2eqn3GyGsDAURR"
      },
      "1.4 SUST DEV&ENV": {
        "part 1": "1gHP25ECVbHfUiefTo3d23BkAGZ1a2N5p",
        "part 2": "1iCiH8dq3yFT3gsWJ0buHzc_TnFwCpe_j"
      },
      "1.5 SCIENCE & TECH": {
        "All": "1TGPCmD-l8uWdaxp4dFksP3tTzSdfg6US"
      },
      "1.6 PUBLIC HEALTH": {
        "All": "12-fQNgW5z4ffwNfYtIrcGPpd37peODVq"
      },
      "1.7 CONSTITUTION": {
        "part 1": "1qhOLDZ-Jve_MD5kcYd3TMkGKUhbWia50",
        "part 2": "129oZ6BF88BWuetzK0OY9VTKpnJYeifOS"
      },
      "1.8 INTL AFFAIRS": {
        "part 1": "1Xrpzz3BvIDC12HCnKLTFMMvxT1eMiFuh",
        "part 2": "1iIpIma8D94XERDm0B5TzlJT3Grt83x5g",
        "part 3": "1YoVdF5SYAXdOVAikHtmh0roC_CcV9BL5"
      },
      "1.9 REGIONAL ORGS": {
        "part 1": "1eGUypWoXSmbSCpkiGf6TROxco919xyLE",
        "part 2": "1beEWgqvn3pqC_RihbUQHF3O6QwMQ1_uV",
        "part 3": "1n094gPoSsqLYFWT0gI_5wAsrQq_s2oXD"
      },
      "1.12 Original Questions": {
        "constitution": "1HRlsrjjxF8tW89R4fT9wTGjAnFt0gfVS",
        "Current Plan": "1S39S--nt9QVepKlcszdpntB8rRgAEqfd",
        "international affairs": "1pomfoXhK1mWU7QAO-oihx2SMsPJqxOCh",
        "international relations 101-150": "1TTD1aKKl_P6nGcUxzyyDkpbH2O7hPx_u",
        "international relations 151-180": "1dEdvbPuxrSKys_jlMAJkaHGLuSHQ47fF",
        "saarc_mcq_batch1": "1mgbD6Zr3t5zu7oGAraj1BeIXOqbGSojp",
        "saarc_mcq_batch2": "1SWybO9ZCwzFPvAY6k_8StQk9Nf04MZzm",
        "Sustainable Development": "1922CKz8p81DWUWhimygloqKDNDQXbXXF"
      }
    },
    "2": {
      "2.1 OFFICE MGMT": {
        "All": "1cwgQd3Mzirr7bCs2Rd25P8djqvjcoj9N"
      },
      "2.10 HUMAN VALUES": {
        "All": "1jmmgCYZeNHMTwli-8E4eAbZOf5IkXt1i"
      },
      "2.2 CIVIL SERVICE ACT": {
        "part 1": "1lRdW2CIBKFmY8U4T_V2WQDq5Fgdc8Gar",
        "part 2": "1Vbe7ouOQjfOxRFaUxbgX5HYw9cbdcXGI"
      },
      "2.3 FEDERAL MINISTRY": {
        "All": "1ae85BxIN_v2UQ96SiNnl02GneoaAcQyO"
      },
      "2.4 CONSTITUTIONAL BODIES": {
        "All": "11zwEd2a0OEjsRQHI_q5sJRn07rpRMNrp"
      },
      "2.5 BUDGET & ACCOUNTING": {
        "All": "1diB8Eb6rKod3oA1l18_spzzu_I3BieBh"
      },
      "2.6 SERVICE DELIVERY": {
        "All": "1GsSLtK5D1Hf7LRiZ4BiKE9KFspKDE4u3"
      },
      "2.7 GOVERNANCE": {
        "part 1": "16gnmmdFFhCvEvZd7rWX9LFZwq73X2lte",
        "part 2": "1bVPj2lppDZQBiBEyL-i6XP06GZfbQdmx"
      },
      "2.8 PUBLIC CHARTER": {
        "All": "1V7H3z14ViPpn_XwWzW72cICfMizkaEmM"
      },
      "2.9 MGMT FUNDAMENTALS": {
        "part 1": "1UD-zYvHYz2eYPynyqpPdU1cIWBJNPZLP",
        "part 2": "1gDu3u6FFB0nKWf6unjZrWSTSuubRZ8AD",
        "part 3": "1ReISiFMXvHi_ntwZFmT2r1_CtLE8wajN"
      },
      "2.12 Original Questions": {
        "Citizen Charter": "1SkPP7n4nIjmdEzWu8zZ5nywQaY2BmGQD",
        "Functional Scope Public Service": "1TdUQchW6i2LBKdWsjMNNTGwB5hAR1iCB",
        "fundamentals of management": "1G5BtPfzG_bnmDhIORtJM6N5cmCEiAt3A",
        "fundamentals of management (2)": "1Gzu0Or4R4TufdNbRAfIvuWsstiNRJzJ3",
        "Fundamentals of management part 2": "1pqYGgBageMaEsa6QZoCcqzpjr1Bpd3DA",
        "governance": "1xO4bk4QCPzqCORupW07MtNj-60OFlqZE",
        "nijamati ain": "1W628YzIRlatpN0BhdtVqv1V7q44Fn8F0",
        "Public Policy": "1u3hA3p7wtUaDvzDioLVrFaq02WUuNCpt"
      }
    },
    "3": {}
  },
  "level5": {
    "1": {
      "1.1 General": {
        "All": "1NIg_jBebcqBfVCwnVcpxMoPz8ig2bxPD"
      },
      "1.2 Levelling": {
        "All": "1e-rKLBX_pbKvQ0fZ9JEno9NtWfSjmlVq"
      },
      "1.3 Plane Tabling": {
        "All": "1b-3auXQ7CXa9OWtvfm8hlViq86-UYDs5"
      },
      "1.4 Theodolite and Traverse": {
        "All": "1zcJwQJVvQZytMJe67ZgbQzJMxzFlLa5d"
      },
      "1.5 Contouring": {
        "All": "106CiVOxgVn5EzRf6j6mo3YxRc0ZhVQfg"
      },
      "1.6 Setting Out": {
        "All": "189bAmCvBd2mS2PNQCZb-NLpg4HJKw0CK"
      },
      "1.8 Original Questions": {
        "Sunil Sah.301-400": "13z92Vn1uV7Gw217q-GXQVuOQoV9gUrJO",
        "Sunil Sah.401-500": "1OikW1FEi5Zuei4IrWpbjsTr3-O_hY8PQ",
        "Sunil Sah.501-575": "1WUg2w7SlHVpAEyOlFyfbnymQ-xivfwNi",
        "Sunil Sah.1-100": "1OAlD5XUf-Ecmj4hNViPAqInI5GUcMExG",
        "Sunil Sah.101-200": "1Q6E7isqILUnHG9ZPxTsIltIlEodqr05i",
        "Sunil Sah.201-300": "1vZRNltiqTuJxJn8RVCzrSojNeyRYFEfp"
      }
    },
    "2": {
      "2.1 Stone": {
        "part 1": "1o-Iy2plG4JM4GJU8guQ0_ZhqtlV8vxMT",
        "part 2": "1Mb8DgEvXyMkjxSobjvWKXCtNAidyyFTY",
        "part 3": "1FuiA8nkbHpbKLUJMRl12p7-h01v2COnw",
        "part 4": "1o1miq1ypzZn3dEUQ-KWQcoqq9Xw-FV7J"
      },
      "2.2 Cement": {
        "part 1": "1PVpVhUz1fEOYbzbMNZZyL-rLhPkeZpOU",
        "part 2": "1ZX-SOstrV2RgqeqbdGiRGA0o5McCRyeY",
        "part 3": "1LXXVvcQ60a5mG_5_J_SbaBnsFEtBXkLg",
        "part 4": "1P0IrLHLlFwUyYVUV0CFuiJxSBVc9bUC8",
        "part 5": "1KQkRGQ93WBLCfaFxVUBc890KwR1jxJrh"
      },
      "2.3 Clay and Clay Products": {
        "part 1": "1QKuyOUx4gaSCuciMWreDhi-qBrW3S5gB",
        "part 2": "147nEnY8MF414XcH1qQPb6_lPHjhlbqB9"
      },
      "2.4 Paints and Varnishes": {
        "part 1": "1w9eC68-W7CMP6M7GySExyKHKuZpX7g19",
        "part 2": "1Hw03Q4-UPyfbx8ViOKlgl-W81odgqVCD"
      },
      "2.5 Bitumen": {
        "All": "1KAkNzfIF1y-hXDH-EfiHE1LQrPAuqEaF"
      },
      "2.6 Mixed Questions": {
        "part 1": "18_95gZ6hjrpOz4M1dwLgywgXrsbp7MSV"
      },
      "2.7 Original Questions": {
        "DPARSAD.1-100": "1DCi7TZlsRLXbswMXZ_phkNSvpvR4qEYC",
        "DPARSAD.101-200": "1l2_oKmLGjbMZJAY2EXniIcsXBjgox1LI",
        "DPARSAD.201-300": "1D-Q5Dx7r_PeLb8tuQSJrfdDsSFwje__V",
        "DPARSAD.301-400": "1Ofpj_R63e8ibarImI4Kx4Hjk1GZ5aknd",
        "DPARSAD.401-500": "1WLSUMqyN8bnj9WuQPGRNxK0ssMqDtJ-O",
        "DPARSAD.501-613": "1bQ-eFt4DnPTkejie6Jf435EtGEiwVobO"
      }
    },
    "3": {
      "3.1 Mechanics of Materials": {
        "part 1": "1z2iJK5K3tFAj7cGFUUwUd7MyiRYtfJkD",
        "part 2": "1klS7m64A9741f6Sm1BswA0nX4sHMTIml",
        "part 3": "1EZ0gJhlMVuDsWF341-p6cf6Emjka-140",
        "part 4": "1cCB3OX0H1PxXsc9tFL3Yt5gwXxUDQbFH",
        "part 5": "13HlrGv9VHa3nPpwXqoZVQalGzsDvjbEl",
        "part 6": "1O15MBCQjGI3G0xfjbldXGLEyOxWWCOud",
        "part 7": "1ujD7X9tjpL0o8amH7LkpjklzqUgx625j"
      },
      "3.2 Mechanics of Beams": {
        "part 1": "11nyasGMxa8JCAanNh9jRSRa-NZv-oTJ0",
        "part 2": "1umjufw0l1Auuzlf2FhkYeHp8TCoYhpxT",
        "part 3": "1DzqiWqs5QYWI6z9MR3tlF-AP_d4a9rV8",
        "part 4": "19y8xlXf7mUUHG5VWAqWhRLHNnFVaV67F",
        "part 5": "1-e5Swgkdpf7G6ogRd6hfru5HecFa01OP",
        "part 6": "1HGEVL5WDwsHitOVWVUucJRiwFHzj-wss"
      },
      "3.3 Simple Strut Theory": {
        "part 1": "16xTE4-Byg1VVmEywUoCUjgM7_3Sz7FlQ",
        "part 2": "1OoBLlLMNVdMNlhbrQu6xBsVnjjbWAjLN"
      },
      "3.5 Original Questions": {
        "DPARSAD.1-53": "1RWIKVWCl9djWzUyAL0fMOoeNLIYQfQAo",
        "DPARSAD.54-116": "18XMCDrjLIHKW8aHJYleGOgsnBFX5ANyH",
        "DPARSAD.117-164": "1zkZh7YFEn_-fyk1QfxBtl3VvQ5aY-Euk",
        "DPARSAD.165-187": "1ZOWTP4bQeuvcwui5xkjqppdCUBY_WT-0",
        "DPARSAD.188-221": "1_1IxcEHCZPlqN5JfT0agDZXoUxBmiroN",
        "DPARSAD.222-250": "1q3-aYC9cL7u7Ga4r5kGgGVE9BCiipX8J",
        "Sunil Sah.101-200": "1WqWfdmpL-boetcfcaRVkAD07U2wScgMz",
        "Sunil Sah.201-300": "1P75cTo6Emx6cKMjhKpSHObrcIZK_Q48Z",
        "Sunil Sah.301-400": "1iltEhT0DIWa98sAnRSZs7l83Sl5Fp4PA",
        "Sunil Sah.401-432": "1H1u78Q95fPXDAzALAwMF2PyrKYqwIluc",
        "Sunil Sah.1-100": "18PHUlO1w4w1P6fAJFl1sVA-vuaArgX4c"
      }
    },
    "4": {
      "4.1 General": {
        "part 1": "1frCJwqS0FYX0pF4VePR-rZROitav2q89",
        "part 2": "1oa0DQ2FKZMpXX6eq8roHlEptFbhGLv8e",
        "part 3": "1z0aO_JS-JjQDAMdel3Npg25XZgX03c7s",
        "part 4": "1QRjLsPj5q9RD3tMNI3jIPHzcPNjRFTmG",
        "part 5": "149fTdWutAmuXYGXFMTI2nHLpoBfmia7o"
      },
      "4.2 Hydro-Kinematics and Dynamics": {
        "part 1": "11GkqX3ndth5zQ9nm_B3dkPCzEDt9pU2j",
        "part 2": "14S3LtZD1x28GmFyPK4Gy89Zg7Dd4r7Ky",
        "part 3": "16mkG8BPbkCKdUt8E1rPYaU7NPVCuOdXZ"
      },
      "4.3 Measurement of Discharge": {
        "part 1": "1r1MiOn4tQlhGL45yoVPxclZlg2-C9DIa",
        "part 2": "1Iv1mXH-8OMAekLLeqVWCX2hGciwmH4t_",
        "part 3": "1P27XpNkUHN4onYsbJd5sA630cpQKfHXo"
      },
      "4.4 Flows": {
        "part 1": "1sN3tKIbh8ofcoLF-yM3vZQE7DuLmJCE0",
        "part 2": "1d_Fps83cIUhn2CBfzlh4TFlF6sBRzBGX"
      },
      "4.6 Original Questions": {
        "DPARSAD.1-100": "1W0Haw_2D00dCGnytzmtiDG40WXiW356m",
        "DPARSAD.101-200": "1q0lScj2EGQYv7n16ZY2qbluOG_xWtgd_",
        "DPARSAD.201-300": "1--gbS8anKXq77VRjm76vm1JzPBQ81NjY",
        "DPARSAD.301-400": "1TcZcXzv7A7eQP_WK7EEySIfWVESgF-fQ",
        "DPARSAD.401-450": "1YwIBiSps43xKr3d5qeODQpW4bQcEFTNj",
        "DPARSAD.451-520": "1WOcNHBJKZJzcjKDTKz215XvGN7N3o7WR"
      }
    },
    "5": {
      "5.1 General": {
        "part 1": "12zlNBCAU3--JCL6zwBmGng-NdDbb_Yat",
        "part 2": "1d4liMSN79_JhNxSvgn9EI6frLx6RTjBX"
      },
      "5.2 Soil Water Relation": {
        "All": "1XQNe0D-dg5hsnGJ5NO9nSs2E5epQFw9T"
      },
      "5.3 Compaction of Soil": {
        "All": "10lDI9VM7gwpqyka-TwZYG-FNXI9v71ng"
      },
      "5.4 Shear Strength of Soils": {
        "All": "1xkV1UXtFbSGky3nXTb7JgvtO0ofNR8_u"
      },
      "5.6 Foundation Engineering": {
        "All": "1Akmd6M_1y1ot50dSK-D3wIMVDc4Dcswu"
      },
      "5.8 Original Questions": {
        "DPARSAD.1-100": "11DZsjZfw4WbmglOxGRErYh9VBNv1-yy7",
        "DPARSAD.101-200": "1l6ZBNY7MlRItTKOsglSF9xDGEQ_hrVZI",
        "DPARSAD.201-300": "1ZMPdpgCvJ4LNPVSr0enHKyGxVIr7QLth",
        "DPARSAD.301-400": "1zKOJP55egY2xSu8yxTbQZwRulKyyqwb3"
      }
    },
    "6": {
      "6.1 RC Sections in Bending": {
        "part 1": "185jssU6DXu9RuIT3dCLny3jl7EunBgZG",
        "part 2": "1WSvi7PAepKOpTD603C22jIpwe-vJMpfC",
        "part 3": "1WX3Jz0g1FS73BsyfNPFrRhmcGliBiOb-",
        "part 4": "1OwmOcdlJT-iOVNMvR6ZhRW6JhPHUUZqP"
      },
      "6.2 Shear and Bond for RC": {
        "part 1": "1jdZ8UVxdcvSMYe7cfj8B20TmgSVB7ZGt",
        "part 2": "1arnuQ6iVEjiclqeAnPNhHva-FBRbQ6pX"
      },
      "6.3 Axially Loaded RC Columns": {
        "part 1": "1APWOtuQ8kdTt48dYbttgtrHFv5tIUklF",
        "part 2": "1uQBjW8nvJLkwa4UID6UcvusS8ED73Q5e"
      },
      "6.4 Design and Drafting of RC": {
        "part 1": "1eX-zafEFlXv1ICoTNKHIHYgHELZsxmvI",
        "part 2": "1o9G5zxKur0lJ-lrTc7FVg69A2cC6m5CP",
        "part 3": "1FHqNhZbXtiMt3fWBmke9RRn0BjCCvzbE"
      },
      "6.5 Mixed Questions": {
        "part 1": "1UXhxqUa49lxAOz9PvHl3LTNbSIOTXYV8"
      },
      "6.6 Original Questions": {
        "DPARSAD.1-100": "1ZTRwGwGkdg6DpZzVizUQEkF-Z1IQT3a2",
        "DPARSAD.101-200": "1NJIDXdgssUhX0QcnmIIN0QLWQjuP-gjs",
        "DPARSAD.201-300": "1n7Qn2gqNo6du6XKb7AjwBypuJIKKqXEd",
        "DPARSAD.301-360": "1utWod1N1YyvWcxXTa-UkD6YobEPmVXri",
        "DPARSAD.361-417": "1i9tauS85s-o8G3L49QgmBaE-6isjbRLW"
      }
    },
    "7": {
      "7.1 Foundations": {
        "part 1": "1sL_uCg7K_rdC9U8ekZ4Q4_clxsFoI-9X",
        "part 2": "1_P_jtVxIIiTQoxuwbbuv6o9g2LanXUDY",
        "part 3": "156H_lLvhE1TpAhBk50QpjIrfk6rb2CnP",
        "part 4": "14HSNLzrq7sSww-hqJI-xTE4LPyX-zNzX"
      },
      "7.2 Walls": {
        "part 1": "1Ir1BNzeS3gnwtmcRNmwfy3hG7xy214W-",
        "part 2": "1rlOsEkbxHdYhDu3ShyzpUTnhaP9nkeFE",
        "part 3": "1l828uHAoShLg6zZxn4EePC-7jrD1IWBb",
        "part 4": "1eWbSiJp8rOxEPnxSRg4Scnqi9c_dv1h2",
        "part 5": "11_CGZgurxsjm0shCZvbCXcHyl2Ke5N0i"
      },
      "7.3 Damp Proofing": {
        "All": "1jxyRq79D2dW80lgaahZVH_CY2SOwav8h"
      },
      "7.4 Concrete Technology": {
        "part 1": "1YoEe7RoyZvOUR26oW6qPCogIZ8mOt1m4",
        "part 2": "1lMLwfiTk6p19XFb1BGu97cIYpHPI1a6y"
      },
      "7.5 Wood Work": {
        "part 1": "18cGq_dYYI__L8fpR7INklLeIReZyYCW_",
        "part 2": "1xUBTkm8EAS-z2JtfKzUM-BNHCx2aK6mq",
        "part 3": "1Q_TZJcEYgbiBEpdRbUuGA1fP3X9t8-O_",
        "part 4": "1P3pu9hiBdvXir_Il5r0XEz3hL6YmqgTK"
      },
      "7.6 Flooring and Finishing": {
        "part 1": "139yiYOmrixQA64kwiSWujwRDm9d58NKE",
        "part 2": "1EGGaobSuTWJMl4CwPPuj1Q7SbLCMyaKR"
      },
      "7.7 Mixed Questions": {
        "part 1": "1-1UwUQVRvcH2BFZAGSNexjhmr9Mdy7ph"
      },
      "7.8 Original Questions": {
        "RK SHRESTHA.1-65": "1kzYm9czns3Do26a2XV8-tTm5VSJ_TUXt",
        "RK SHRESTHA.196-260": "1mZP6ujsccyC8OlKwMyGssf9t4st7-sPB",
        "RK SHRESTHA.65-130": "164FLjujhfBl-q2Q_CaYcuW0T89fY1avd",
        "RK SHRESTHA.131-195": "19DsKXwT_RSX1B_xlQHz06tR0J8HLNf1C",
        "Sunil Sah.1-100": "1H8b2DIcDQQ4dCDRaJctM6mYOyMMa7Rh-",
        "Sunil Sah.101-200": "1jYggTJbHhYxZDvroz5XIk-1O-I-trv5A",
        "Sunil Sah.201-300": "15f2CiEgfd0y45C6YiAujV35bpvHBpGnG",
        "Sunil Sah.301-400": "1upPz6YXp7yLLjz73lnzUP828EFApy-Mb",
        "Sunil Sah.401-500": "1eVtbEWc9LGsLty0Y2ZM6PDeIk2ykBP2b",
        "Sunil Sah.501-600": "1_tytL1YFi_8glzjswiGKelgkQrvNNAfQ",
        "Sunil Sah.601-658": "1V_Cgasu59PipCReiiMRzcqeKDHwTfDoe",
        "Sunil Sah.659-716": "161Hw8Db80fggFIBHTkzKwiDqm9oApAA7"
      }
    },
    "8": {
      "8.1 General": {
        "part 1": "1X8nwxH2WchZqrrsVjPPNZiWeMbSmZJ2L",
        "part 2": "1_UQQ7MvETa1uHWF8xWE3NwrvfDyPUojf",
        "part 3": "14iiW_wKWuftWQvcsaTmAkI0CekRcZYWC",
        "part 4": "1ruXS3nTrN0KuyvIu12NsGFbZha56T9ia",
        "part 5": "1q0rxBoa52WR1rHywG1thj4oT0Z8PKr1L",
        "part 6": "1fWH9TD4cgHbkKdSKCNUIP72NxoUgK4qE",
        "part 7": "1d2cWRQNtjtYJnoRe5z0Mc-PqxgWzruvc"
      },
      "8.2 Gravity Water Supply System": {
        "All": "1r2Y60yTMm0paC3NeuSlw7jfHfYW2UTGM"
      },
      "8.3 Design of Sewer": {
        "part 1": "1qtqIcg4QrLTVXAsvla8XLdzbdoFA9DoL",
        "part 2": "1U3g2kXZ2fWQeM2ThnmVA0n9s8woFyqEU",
        "part 3": "1xjcUMx8OsUaNRTy4pB7p1KkG0jGlJaID"
      },
      "8.4 Excreta Disposal": {
        "part 1": "1BDlcJeVsAzatO9TktE9tSQKbTi-BiRuS",
        "part 2": "1aoIVMpCKiBWeZUY6TMNs_Cjlhi7QrwJC"
      },
      "8.5 Mixed Questions": {
        "part 1": "1WQ96vxX4xnPMeVgicHhHhmIzZSLVKgIL"
      },
      "8.6 Original Questions": {
        "Sunil Sah.1-100": "1oCYIwNj8h6SdiOP4bB5HNG3cyX6ZRygd",
        "Sunil Sah.101-200": "1lSJuN-fvaBRsyABUNPApWm09rZn_V0ko",
        "Sunil Sah.201-300": "1aEj_hw63qbOfJsIp1AwnyulTRIQ-e1xh",
        "Sunil Sah.301-400": "1tHiL_rKWaNRHd0y2yphJpElMNKBLDiGq",
        "Sunil Sah.401-500": "1A1Hh0YqmMLsLE7-Ey-9YrYHbRYccE7iZ",
        "Sunil Sah.501-554": "1LnUcKO28KnhVXIerrj003UsrLAiTdUoP"
      }
    },
    "9": {
      "9.1 General": {
        "part 1": "17506rUIg5kiuQ3JGSV52EYMFFbuKeC3a",
        "part 2": "1HADuF6hxKD4y7JUB2vpRgwKjcVrX4-mh"
      },
      "9.2 Crop Water Requirement": {
        "part 1": "1lOnbJI9UmqxPfsS4oojM9pYVvRDdeLzn",
        "part 2": "1rEtAC8WZ7Ga_Wg0itKuXHOQtynQub48p"
      },
      "9.3 Irrigation Canals": {
        "part 1": "1sTIh5qoKfiXOpX9JJ5sdbStbW8zDHqUi",
        "part 2": "1BiKBPmBcXRU62avRpL4oCshIWSF-iWi7",
        "part 3": "1iiTqjVkKb0ytHae40lVzl2VW6F3dSq_x",
        "part 4": "18IGHEaRF6JUZZtysiahUS86tz6ZqNyq6",
        "part 5": "1yerAIIxcZ6vXFSjBbhoYXGL3cyENF3Nz"
      },
      "9.4 Mixed Questions": {
        "part 1": "1LH1Seykz_ElNuxyYgQHQwr_cOe4r5X2T"
      },
      "9.5 Original Questions": {
        "DPARSAD.1-100": "1SFVGZBZCmcsMlBRLuv3rKjOr-ocKuJTy",
        "DPARSAD.101-200": "1CeQH3i49wF9dc0e6mIznjiSA3A9Qxf3u",
        "DPARSAD.201-300": "1ho8sdNzmE9YHBfUCBWg86ti4oH8w_UxE",
        "DPARSAD.301-376": "1Zg4rlXqtmFgUctS53I_ga_gtj-u3KEPC",
        "DPARSAD.376-408": "1rcHJY4DnOgABTsz1JrrwUlLcfU7VWKhm"
      }
    },
    "10": {
      "10.1 General": {
        "All": "1jk_vF8d8c-ronWaGmjZxsszE53_gYlfJ"
      },
      "10.2 Geometric Design": {
        "part 1": "1zHgH1W-K1Cl50Yp4AimI5DI3VHFTDrBE",
        "part 2": "11el9ikEoQ_-xaoUUO8rdnk9zmPLrWrmm",
        "part 3": "11x_J3r_AGRPW044IxrC-cSvWA66RvII0",
        "part 4": "1FscHGiFpMVNZ_7C6FH5Npr0CTr64SfQB",
        "part 5": "1zeeTAQNVWIBgl8VD7QenH9UutqQNFTWb",
        "part 6": "1b9W_8NYk71inyLofAjluRl50PBd539fB"
      },
      "10.3 Drainage System": {
        "All": "1LfSRwljChSwel8fFzmrsihPeAwOufIMu"
      },
      "10.4 Road Pavement": {
        "part 1": "1wcSVdWbEJVt1vD4aeH2hNBHWSvSlLheE",
        "part 2": "1FIHMTggydQzQgYQ11YJKCkSBWjSiOtMY"
      },
      "10.6 Road Construction Technology": {
        "All": "1aqMK9JrcMDYJxiSn_44gNFLqZ8cTvCbw"
      },
      "10.7 Bridge": {
        "All": "18vGkXUzKalO3ABVAJekN5YnY8Mkdb6L2"
      },
      "10.8 Road Maintenance and Repair": {
        "All": "1yLUqHGO9Jmstwcp0uPHQzvpgRrEGWX7U"
      },
      "10.9 Tracks and Trails": {
        "All": "1xKp8FuigoWC_GNXHq7FnbRyHWA0sUeUQ"
      },
      "10.11 Original Questions": {
        "Sunil Sah.1-100": "1oglXPjLqCifewdj8-0MDx-UI5oCVyJ0G",
        "Sunil Sah.101-200": "1DJWlgozHY4-Obn4FAzL4ITZZJIiyCcrD",
        "Sunil Sah.201-300": "1NdciqWDMenHJd9Nl2euJaazASJRkYbtE",
        "Sunil Sah.301-400": "1ZDhz_MWRSrGpOqNXj69-Plkl2RRaja9M",
        "Sunil Sah.401-449": "1KEops4saZRcQGJPtcFAunGue8A392Qwy"
      }
    },
    "11": {
      "11.1 General": {
        "part 1": "1DX395wZnUf-TfZehyGrOwztXTomkiyRv",
        "part 2": "15HmShOpp6kqbNogX70sgx22JVM9RAO6t",
        "part 3": "1IdBDxs2ZilPbHZ_H9ccKSU_BXccVpkbs",
        "part 4": "16sIKbTnI34A3oNrDUaQDB8AX4uwRiFdi"
      },
      "11.2 Rate Analysis": {
        "All": "14b6cJ-lSW-mvNJMtWP9MnCdkw2DphisQ"
      },
      "11.3 Specifications": {
        "All": "1eiGk05ZRmDTCKlPTUbtaGcLoQwuAsriL"
      },
      "11.4 Valuation": {
        "All": "1rliVSPpTIOn-6WwR_npjPgq5ENgWWG3h"
      },
      "11.6 Original Questions": {
        "rk.101-183": "193NC9O8OnKkqdC8dXCxjzvB-sYnD49_q",
        "rk.50-100": "1RLHdLWtDPgQnpNDpO4fdRGBHwMI0LLsX",
        "rk.1-50": "1ivzRvvI9ZqXyyin4ncwW-GQIzECHOEDF",
        "Sunil Sah.1-50": "1PatlHpX83cgMO8VH9bbOq6aRoifCNoNW",
        "Sunil Sah.101-150": "1pN1as3DjClVrYhEWBKXXwR2n4Egd4IIc",
        "Sunil Sah.151-200": "1WdqpEn0eSgZzhbT7X5ycF6m57bpRctBZ",
        "Sunil Sah.201-260": "1WmIZf9XFN9CUPxJ9rzwBf6NvE_qrje42",
        "Sunil Sah.261-312": "1wJZMh8dJYUF4Pm-qa80sU0sYMYX8hhKj",
        "Sunil Sah.50-100": "1S82Lnx41zlFQx4-H7bGWW1Zt-I7zCeSx"
      }
    },
    "12": {
      "12.1 Organization": {
        "All": "1EcRb0sY6t_YZMdaQbX3qJkFIo81aXcsY"
      },
      "12.2 Site Management": {
        "All": "1tzgFHq_NUBjbNwMLL-3amANBKT7fvhSL"
      },
      "12.3 Contract Procedure": {
        "All": "1T5RwMtlW3T3Nj0ZE3wnW26VdwAkEJbwI"
      },
      "12.4 Accounts": {
        "All": "1aKwgnngIF7-0yA8a9LFN4IpDS4mNNJYS"
      },
      "12.5 Planning and Control": {
        "part 1": "18__-HcVQnYPWZhooSTPq5PZvJ18qzvnS",
        "part 2": "1IaXRHKfBw76r4acgopMS_a4bXdotK0ic",
        "part 3": "13KsILyO9Y-gTz_M52qRrvrnGZVMVbvDG",
        "part 4": "1Rt0zRyEnEr-fiiGH1lGFsr-wDlfv8FGY"
      },
      "12.7 Original Questions": {
        "Sunil Sah.101-200": "1EgH0tKtUJQVmsopLeh61lXTTDzMqbMy6",
        "Sunil Sah.301-348": "10YYfufwvVqTi5XKlSlDQRzeap99HI8Lo",
        "Sunil Sah.201-300": "1ErTJa6lzuCmqtcWMFMH-bwWQnsTPQByU",
        "Sunil Sah.1-100": "1atj3Pt2St3Ag_9Lp1IIKfyFfzyES4jCu"
      }
    },
    "13": {
      "13.1 General": {
        "part 1": "13uL7ymVDlAyX4P6BMmsQzrzzI8iWB_UQ",
        "part 2": "1zfSMjqT2t_TBZcQ78OmqaUZMegPCZevO",
        "part 3": "1zT862_ZpQJIDmWFDERe_8c-OusiohEdu",
        "part 4": "1JGnZXuZw-GhqEFPMnLRiQkelfFCTGGGP"
      },
      "13.2 Design": {
        "part 1": "1OHAdFgj4JcsUR6m2hRmcXgvJhghii0Et",
        "part 2": "1lrEwE4Fo4xit-idgdIfxEHzms7gvDlLc"
      },
      "13.3 Airport Maintenance": {
        "All": "1aWDZo50WzdrB-W3j0paooM6Ya2uGehHP"
      },
      "13.5 Original Questions": {
        "DPARSAD": "1uxYrB-uf5NSsrjV51lL7hsrvdlDfWP0i",
        "Sunil Sah.1-70": "1W_tOzVueuNMTJEj4Zuwxkk4TxaSyHMm1",
        "Sunil Sah.71-154": "1t8HiHvCUclSdZ_le0PzOe-D5a77xsVpj"
      }
    }
  },
  "level7": {
    "1": {
      "3.1 CG&MOI": {
        "All": "1iiVc-vMKONMQS_7unKpbovh2xnZcIYhZ"
      },
      "3.2 STRESS&TORSION": {
        "part 1": "1C16Bdntj4jx4eFZ5_H3jlpSWjzwsQoiY",
        "part 2": "1t9gbPvDMnXEtn7UtcR0oe4v7MwHm3LX7",
        "part 3": "1sImmMkK0ivOlmWb0sM-cDg8BKf6SwDSf"
      },
      "3.3 BEAM&FRAME": {
        "part 1": "1hValUmDeveADXR6iEdKeAsHqODOrAVdc",
        "part 2": "1pCVQ8_SVH8tEM1dv0XCZiQEwieT2gTAB",
        "part 3": "1ZiFgVB_tg4eOltXwoymqW-hy1AROn8RX",
        "part 4": "1rDNzUWDeG8L0EgwvDZGdqYvaHRfbwfpu"
      },
      "3.4 DETERMINATE STR": {
        "part 1": "1HRL4GtwSJUcSvHElubllmEWpFRSY7wnw",
        "part 2": "1I6L0A2K3E3b8VZ1dadBkY7CZ0JjaK5ua"
      },
      "3.5 INDETERMINATE STR": {
        "part 1": "1TbYxUS8M5u8Pe_7f_QQQWwXJ8auXruEU",
        "part 2": "1I4_a7MoUANsMx2X1v0AXsbWO4T4OuB4m"
      },
      "3.6 PLASTIC ANALYSIS": {
        "All": "1FJR2g_0O4JsCQy2Q1MUN3e_8Ta310YjL"
      },
      "3.8 Original Questions": {
        "DPARSAD.1-70": "1h3NQ9AL7DSx-5K3uU7XSb9Q7CvPiRwPD",
        "DPARSAD.141-228": "1ulh8RD7_hHeBUyrRD95kW_bgyvKQsk51",
        "DPARSAD.71-140": "1mgOsZkjGqWZ1AOhu1oQ6ZWtIOA-R3RwS",
        "Sunil Sah": "1SYaPlCkwC-XxwftdjTeM-PkhN_Ev9wa0",
        "Sunil Sah (2)": "1NGZUdBqjXRUN_MO-1L7aYt_Q_1T3rvWq",
        "Sunil Sah (3)": "1cGuCioKTYgWHUrSc9lbpcBYVIyh8RbW3",
        "Sunil Sah (4)": "1T2AoK8ukETL8iwoA6edSpnuhKPcVD67P",
        "Sunil Sah (5)": "1q0DNrOwCWM8-Y5AlRMrZtsVp1GhjZ5ws",
        "Sunil Sah (6)": "1wIseIvXaPMtURT040fH1rr4c2EYkcSnH"
      }
    },
    "2": {
      "4.1 INTRO&CLASSIFICATION": {
        "part 1": "1arm1lX3TnCcU-RZ6O-4ibb6G5bTidOkz",
        "part 2": "1eq0y_Zodf3t0gCJBvh4ZA0QIyMAaswyl"
      },
      "4.10 CURVES": {
        "part 1": "1fx99wkcafDm3S_x4Jsch63am6PpzqF6a",
        "part 2": "1fbd4hrznuIYqCr10MADnjvfgyGYXhVpf"
      },
      "4.11 AREA&VOLUME": {
        "All": "1Y0XxACkB81r0u8YHjwHPw_qLc8Etz5uB"
      },
      "4.2 LINEAR MEASUREMENT": {
        "part 1": "14r_W4lbGMdy4jbqTnhJIz8R36FYJnTWl",
        "part 2": "18v_U6T3Qt5Sbrcnq22KnmDeTsgydHRyE",
        "part 3": "15Pi4qjFt86lXS-pwFJFfjab-jD9_6a2e",
        "part 4": "1Pklj7JQGl8UUkk00UwyCWVsc7y9M9-G8"
      },
      "4.3 COMPASS": {
        "part 1": "1Fjt7mIM6tvE-AGDI1FkGQvAS6fb89gwB",
        "part 2": "1Kjb_5Pa5ytOAGVpMh08b2inkZkkr6-X5",
        "part 3": "1GN83C2HI-2VH1-oXnkkrjmyC0GQF-dpO"
      },
      "4.4 PLANE TABLE": {
        "part 1": "15yDFFcERQirMITe1jkjdErvKmOmP1Jaz",
        "part 2": "1u81hMmnRsqiBHHfaC8D2uxGS321wRqLI",
        "part 3": "1EDTao8tNjFEBO9PpL6Cu3BBKh-C0QTuH"
      },
      "4.5 LEVELING": {
        "part 1": "1KljWj_IZISrSe3_fKSvmXs052atrUOue",
        "part 2": "1H0OlOO7UGIVtWe8IBrJ-H6k9P6pDtSES",
        "part 3": "1EXj_esKomzfU1fclmmSmKEz3seYLVZCK",
        "part 4": "1DCtJ6pR1GofJEa-yiOjiZp7yyGne6Jip",
        "part 5": "1D6cqWA6pb0otKO3GbvL7Rq6cXNFS-Zp5",
        "part 6": "1w9rQXRIzSLBiVjsntm0WzEVxCrsM6Y2K"
      },
      "4.6 CONTOURING": {
        "part 1": "1TX4MHcvTQ2QPWdpHAh0c1RI93qrWTY2S",
        "part 2": "1ePlhEbGendsnLjLD7dIx768s_ngZA6ZW"
      },
      "4.7 THEODOLITE TRAVERSE": {
        "part 1": "1MVWUZb35G5eQ4OAzIuv9LgnCsu--NLaS",
        "part 2": "18oJhZlL5c6-U3UIgkR_RQwGQv-2hoqpC",
        "part 3": "1qpPX-KLvvMZLvrO_4fPzF83pCIm9_V5y"
      },
      "4.8 TACHEOMETRY": {
        "All": "17nJxDnTgT0OzHiw4P6_xiT1_ue9EBhXZ"
      },
      "4.9 TOTAL STATION": {
        "All": "1CYuU8BkfvWl7HG1LhofnwedO18Wz-obU"
      },
      "4.13 Original Questions": {
        "DPARSAD.350-455": "1K1C4cyYliqsH84pwlxrBmux8HNUtv9Ra",
        "DPARSAD.1-100": "1yXZHd56UGxIi5RGl4XA-600dDaq8PpDR",
        "DPARSAD.101-175": "14zRkZBGZnFXkxGylMqplHxDgq53CWayc",
        "DPARSAD.175-250": "1TzBMpOzm-Qp5-yqB5T7y7J3cS06Kt8vs",
        "DPARSAD.251-350": "1jw4nzypzxqQo7xO9JcRUUtyVL1U6kbDq",
        "RK SHRESTHA.1-77": "1dCqKCDCgIyoNobRilOdP50bbqmOdTSWg",
        "RK SHRESTHA.155-231": "1qHHhdU_TtWnM4uvp5EwHQx8m9N5GAk05",
        "RK SHRESTHA.232-307": "1vNqbQIhOgiFmeGsmZj6AhKGmnqNm7Yr-",
        "RK SHRESTHA.78-154": "1cCrVquPYs1VH7b2eKv9yqhiDttbjoDgT",
        "Sunil Sah": "1R7x3OE95XQPVmtQWwbpxmNf1Yy7x_6LS",
        "Sunil Sah (2)": "1QJW-SbfzpX-XVa9XUx8dRoByzLZ5_al5",
        "Sunil Sah (3)": "1a_rVm4QbC1c6_U7z7dnHE5pZgVll-_-A",
        "Sunil Sah (4)": "1M1PyglCK1anE-MhJ8JBcM5Ui5YFs51Dn",
        "Sunil Sah (5)": "1YownbVlSdNXyiZvQ0A98cO7plR2RnSQy",
        "Sunil Sah (6)": "1GCrmRw51TNVLLhW4c21LGhpWISZwjaB3",
        "Sunil Sah (7)": "1F8NrUyduFKFqDzoDq48CZjLag-xQXCYe"
      }
    },
    "3": {
      "5.1 MATERIAL PROPERTIES": {
        "All": "1DPZBrqIKrjsMvrwbtD4MKwAQ9NA_2IkF"
      },
      "5.2 STONES": {
        "part 1": "1CxgBu1GxjHvnIoEduM-sH2Lyc9zW4HK3",
        "part 2": "1ITuHOSUuJWP0wRyvmEM67mdTrXa4wdcF",
        "part 3": "1oFi0v3qqgiUmBNJU6SMlTVQ_CIG2JxXF"
      },
      "5.3 CERAMIC MATERIALS": {
        "part 1": "1gPfa4i_7IDPgb0fM6fVvKuHQVBCrr8_u",
        "part 2": "1AKFHJiZcaQ1M25Wd_i4QLMcWUzoRll2i",
        "part 3": "1WXPEwCWoj5kt9BrDo6MAYZlJVaPf4zhF"
      },
      "5.4 CEMENTING MATERIALS": {
        "part 1": "181DxYfq9HFrGa4ybX1gLJwI_Rbnk95Cu",
        "part 2": "1H4GHl2pt5BdBvuY7ZCGJU5-S-ND3IRYz",
        "part 3": "1bMwzdXa7OKExo3UlanIicKuQER2OzfMq",
        "part 4": "1q1MNSf9L1GrCfKAZFqfEg51j48qTrr4Y"
      },
      "5.5 METALS": {
        "part 1": "10qHHUPQsB1likdvD-LlNV6II55DJmCbr",
        "part 2": "1EYM0pgbC52mjVsnl9eWJZOe5IcCSZx-D"
      },
      "5.6 TIMBER&WOOD": {
        "part 1": "1XePMS5RkO8bLlzDwFkjqA5zn0gOmGKYR",
        "part 2": "17m897l0KuQXLpXrSbsxrXKyWnvwAHc31"
      },
      "5.7 MISC MATERIALS": {
        "part 1": "1d3hj1yfZ6sAsaPdXU4sVLCklyikdeubw",
        "part 2": "1hpTxxjCY75f6SxdA9b06GA7NyyXDF_86",
        "part 3": "10E_bM777jH4qF9dU09QFZIzMhw0V13lV"
      },
      "5.8 SOIL PROPERTIES": {
        "All": "1bzvyQhTHyaI12hRC95J68x9xwqMFazBu"
      },
      "5.9 LOCAL&MODERN MAT": {
        "All": "1J6EQe64MHWL9zY5h_QBNIIUxaqyOmqq2"
      },
      "5.11 Original Questions": {
        "DPARSAD.255-350": "1Z-kyfriVVY8ROCOK7_jrzVg2SuL2xP29",
        "DPARSAD.101-175": "1xXcFMVIymWnuTOJF-nh9SSJzuXNQYfWr",
        "DPARSAD.176-255": "1-XkoaqH9T6hRKec8j-dfuJwPKQDKYpFt",
        "DPARSAD.1-100": "1v1LXYwzNF2TafCQKunBOrxl_UHn8W7NO",
        "DPARSAD.351-447": "1jTaYfKLulzd7heCGJc4BLR5kaaQA0mX2",
        "RK SHRESTHA.1-75": "149Jiv13N8z5n2UdmhfE8RaXnGiQPz21z",
        "RK SHRESTHA.151-225": "1MKSdWQ_63uRElC6Zlr4cMIru1csvwEdQ",
        "RK SHRESTHA.226-300": "1rDmevr2rOcf894F7agAPNtN_ku6i8HWU",
        "RK SHRESTHA.301-375": "1GuCW5aF4k2IMHGOJoKKUDw4vvAGb8THc",
        "RK SHRESTHA.76-150": "1QW_IbwgQyEyfqVeDezET5dZHRqb1fMDq"
      }
    },
    "4": {
      "6.1 CONCRETE CONSTITUENTS": {
        "part 1": "17RFSjtwK17F3aZNL0luOCvRCbaYQkZ3k",
        "part 2": "1vft-Gtc3DE8C8WWpJxxYNBdIuEWCukE4",
        "part 3": "1mOtbA-VGSYQsHgtZ9draNlm4Nlxenx_a",
        "part 4": "1Wz_h_eGns-25t0sWwgv7KUe9y06c--4j",
        "part 5": "1rv6WmJdwQ2l0l2ShAIUKFX9ImYDDeWDA",
        "part 6": "160yttwSKiZkCe-Xa0w50gIpmT94UQuWj",
        "part 7": "1BhZXE1F9GUHa5wS0CgYX0YHX75NRbh4R",
        "part 8": "1vcmX5gpz0hQqgmFlYlG8qwKK8bW6gdap",
        "part 9": "1XaIDsbVlWPUBXlMXafZeS3bFth4jZgJm"
      },
      "6.2 W-C RATIO": {
        "part 1": "1ml574dyLARbk7fUogRpn3eCkKg7pLJE2",
        "part 2": "1DXTm5JiqjD086RX3PyUk7imsX9tMvjlo",
        "part 3": "1A1CNx73vMdqA7dWIuv1k3gnBYRhK0Xgv"
      },
      "6.3 GRADE&MIX DESIGN": {
        "part 1": "16Xj2QfSRu56rR5UrjdkJ-6gLE4Xe9bMp",
        "part 2": "1bXvIyShKySJ8JObRDXstBj_DYMB358bh",
        "part 3": "1vyKIakiFA9ufNBBHtTBDh23DD1YzdF13"
      },
      "6.4 MIXING&CURING": {
        "part 1": "17tK1VOP_-qF2b1JQ7bUQkBYQNEurAw6o",
        "part 2": "1XQUsz85hfF88T7wLFLnQ0-u_8VQxON5u",
        "part 3": "1AB6C8lxwVgYAjnEQ0LtJGt2aHWLhTX9P",
        "part 4": "1st2ifQGlERkT-fR9XmG_7fnCqieoSUpz"
      },
      "6.5 ADMIXTURES": {
        "All": "1b4ZthzA_g51O4NdrdbQjqC-8q8eOpKtU"
      },
      "6.6 HIGH STRENGTH CONC": {
        "All": "1y5o1vipQ9kh3LkilN3AFR64bXBRjkWoX"
      },
      "6.7 PRESTRESSED CONC (sorted)": {
        "All": "1rPtUC5QJqlpm8ja-ix74JPsARmFDFxSH"
      },
      "6.8 Mixed Questions": {
        "part 1": "1qZqGf-yaaXuR-ompna0VuyIQ2H0BR6lE"
      },
      "6.9 Original Questions": {
        "DPARSAD.201-250": "1hAP5zyfL5MaK1EqS_J-ZSWQXAX3J0UOB",
        "DPARSAD.250-300": "1sRb5evs5CLiK0xDn6wHP0qQmi2sY8f4s",
        "DPARSAD.301-350": "1Bug0gYU7UcILpX9je5xtgfWfHZIEN4W6",
        "DPARSAD.350-405": "1UoQ5GoTD_ggx9AJqAaqYgfLARb10pqOp",
        "DPARSAD.1-50": "1jhAs_3b61Cn6YjY45hHqwO2ceJuygbr_",
        "DPARSAD.101-150": "13T28p8WnYFPqNguu_4YsRnFJ5zOlaQ5B",
        "DPARSAD.151-200": "1OjdrC5yQ4x8jTijTNm6VmOWG5bqoBpQ5",
        "DPARSAD.50-100": "11UWRoG-JKMxE28HF44iUGYidJ46XIi17",
        "RK SHRESTHA.1-80": "1ogn7X2qg57YbNVu_ExzsW4aas-8TKEU_",
        "RK SHRESTHA.161-240": "1GgimqtgDGbUjdXAVP6J4KXdfEx5NcFhF",
        "RK SHRESTHA.81-160": "1EaAqgiwXjaXsiwP9NBB2Vn07RhIBfPTZ",
        "Sunil Sah.1-60": "1I8ti2Liy5ilh2uBYdO9PmAW8kljhC__F",
        "Sunil Sah.121-180": "148pAOJF4XsyZH1ftczmiOe17s9l6H_QL",
        "Sunil Sah.181-220": "144aeQ3ca88BOkOTuY6OVNYw4N7Sl38tm",
        "Sunil Sah.221-250": "1IR47BbeJlX4udTxQen3BDenqPiB3JooP",
        "Sunil Sah.251-280": "1EJWipU2hIXp5RAb8rry6zj-vCb408J6P",
        "Sunil Sah.281-300": "1M06-MenO-N3wfL-NCVRo6tTHwhaFquRx",
        "Sunil Sah.301-320": "1FbyTFzBHKbY7lURjTB5f9II69lJQozba",
        "Sunil Sah.321-340": "13XICgJEve_A2ogKFCxNTyqwWPNCkefdj",
        "Sunil Sah.341-371": "1RTu7ujLm_UezISUGbumIMnsrBgTknwxC",
        "Sunil Sah.61-120": "15qUkOJUf1p5kroOCZXXpxDm5zUsLyl8v"
      }
    },
    "5": {
      "7.1 SOIL FORMATION": {
        "part 1": "1PIRsJa-JKp6kZs7fZP_vQ6qFcO_78qf0",
        "part 2": "1VjXNOmlI3YboS8rikMPi3N-6Ni9RiZE4"
      },
      "7.2 3-PHASE SOIL": {
        "part 1": "1Uxnf8-Xjwyk7oqTZJ3cEW_gYWOEfqQAS",
        "part 2": "1mjI45eWj3xQeosH7PdWiCIGWa8aXV5oy",
        "part 3": "1uSnq1OnW9QKJtRIt56T5JZD4xnqwnCC0"
      },
      "7.3 WATER IN SOIL": {
        "part 1": "1cs4EKc5WAyR03ay1dVKJwOIrFFxH8JSC",
        "part 2": "1Hd0AL0_0ys1S5Z2jk-aRlidIWI8gpuNL",
        "part 3": "1bu0W1HhNMyJaeWJstJ9tt2i09c2ZOU00",
        "part 4": "1bx_Cg82U9QjbCqnr1lbZLwIShMdS_rpc",
        "part 5": "1mgn9440PExOdsuR3Vz_vKvsi1U2OOe0Q"
      },
      "7.4 INDEX PROPERTIES": {
        "part 1": "1AxG-gKvmLRO12pFeXJNwQgvItI1GcKyT",
        "part 2": "1nyV3JnDOeOvxncV-I5rmg7gqYvMmIfC-",
        "part 3": "1orKE_1w0N-JpcavonpMJ9QYxA9HEUHG-",
        "part 4": "1wCZGNzydWd2b-ppapyOMqOb-2s5tc0MK"
      },
      "7.5 ROCK&EARTHQUAKE": {
        "All": "1Zh7Yd5-CoHelvevLLN7eNjP0GjbOFOvh"
      },
      "7.6 TUNNELING": {
        "part 1": "1j3LHt2tfZUgGEOubaDi4ql6XtqadZwRQ",
        "part 2": "1f1-oYLEv_o88oETSvK8juulM6Dbsw650"
      },
      "7.8 Original Questions": {
        "DPARSAD": "1ipRrpTWBA7JIdwCuTY73ZZwY0CTM-LAP",
        "RK SHRESTHA.1-69": "1AJlI1Dsf1vugz-e76IOnrLcDUi8ANSvv",
        "RK SHRESTHA.139-207": "1E4vRDqK86c23Ki-reszLKuMIg5-QUsEU",
        "RK SHRESTHA.208-276": "17E7qw-1-Q3cIy8e6Gt76WdDlC-gQsubc",
        "RK SHRESTHA.70-138": "1a5xfPk5LFN8t5C5MSlFupxUw2zf9rGS8",
        "Sunil Sah.1-65": "1ROkwWR58iXj4fHUpBXFEojKqQeB2CAt0",
        "Sunil Sah.66-130": "1hJ21NNiTLocUDO_Fom2CPwHMb6yI80sO",
        "Sunil Sah.131-195": "1TEnCQJjp8bXDSKhbeRfkUpRQyY3JWB43",
        "Sunil Sah.196-260": "1jW-DAK3TOQifU-xL3kadYcrXUdZLV-MO",
        "Sunil Sah.261-325": "18YGtECCnoJuGW54Q4mxyOYdayTiglb0i",
        "Sunil Sah.326-390": "1Q3eLI8NFamlw2kEPXp8jZV_I8OHT8Ys3",
        "Sunil Sah.391-453": "1lv6ra_GUsnq4Wtza6r4RnT-YdP3UgVOk"
      }
    },
    "6": {
      "8.1 SCHEDULING&PLANNING": {
        "part 1": "1tGe9ok2_xpjAatUwH7DV4jOiAt_686Y0",
        "part 2": "1PBoGYvLuJ0IZ6VSrc43Tn5q02oK4qEUY",
        "part 3": "1Y5peoogFnLCmS2PYDa5kBJyDTUGJXK6Z",
        "part 4": "1AlLK4doz0KuMBz_wucaigauHEpIpI32i",
        "part 5": "1gjSKaD0xttgndZTlWJt-xeKY3LwQjrLU",
        "part 6": "18xsQlTL-Xcc0E0Oy45JosPmHfUzhAfnl",
        "part 7": "1Dhfb1ZTT9mAkl3b5CKpFj4lfZ2XhIU4B"
      },
      "8.2 CONTRACTUAL PROCEDURE": {
        "part 1": "1_TVbfw_Y7Ju4HryBHCvXlS-Cv0zysS7k",
        "part 2": "13_KZiHf9ilFhKCxlXe0oe66oS1CN_Zrb",
        "part 3": "10G38zz-klr29YQV7QmJbPRyS7t3EbgBh"
      },
      "8.3 MATERIAL MGMT": {
        "All": "1J5ZNrICbuO8ba8veugqHgfnjOSg9OECl"
      },
      "8.4 COST QUALITY TIME": {
        "All": "1QfkF7wm-CIE9qQ0Tn9BegfeCvL0D45Zg"
      },
      "8.5 PROJECT MGMT": {
        "part 1": "1R2WqNnjwjHl4BszPlOV8WM3igS_dETfN",
        "part 2": "1psuTcue9MC5L5OJffg3R45KhKd3uXxb3"
      },
      "8.6 HEALTH&SAFETY": {
        "All": "1q5-MjxAh7z5PWx8KPP5OyhuARZl0uoMR"
      },
      "8.7 MONITORING&EVAL": {
        "All": "1WrVy2HUMK29GzFfacrDzOMg84l4_B_FL"
      },
      "8.8 QA PLAN": {
        "All": "1RkyWScfmMU3R7TmE1CF2CKn006CLbZha"
      },
      "8.9 VARIATION&ALTERATION": {
        "All": "1NnZbn4knlrjOPqgJgvh0tNLxvUsCXqIR"
      },
      "8.11 Original Questions": {
        "DPARSAD.150-200": "18HnjG1-leT6OXk5mYPGTJluMw2yiFUEy",
        "DPARSAD.100-150": "1KY9GTqB8sTJpGha_JnYYE9Pvnnzotf9h",
        "DPARSAD.200-205": "1KA-3P2cmmQKQRmr_-UU74ik_MmNsJ8F2",
        "DPARSAD.1-100": "1IYG4gFrvXBJ8n2kJRFL1UCRZdUOZsZCv",
        "DPARSAD.50-100": "1981sMj5WNTZeKsghbz4N_eEqqxm1XbT5",
        "DPARSAD.1-75": "1cQGpQHGzekcDnE2duOkYzx3NAoeuPv5h",
        "DPARSAD.151-225": "1tro7AirSkoOm9zYvJyQo5W_hlUvoqvlg",
        "DPARSAD.226-310": "12jhiq9Jbp3EwvqJgW_bxyPq77IYfUEAa",
        "DPARSAD.75-150": "1T2tghXwm_6Dqy5FkQgs0wiRrhl0NQuGM",
        "RK SHRESTHA": "1_KH4l09hI0GeH6J5tGd6vGCQZzNjj7_J",
        "RK SHRESTHA (2)": "1V9EtSiGB2_jaOpTdna_0VGt6iSVh6WmG",
        "RK SHRESTHA (3)": "1vdN4MvatiJJ-7Qjz4epjV6FluEVf5a-m",
        "RK SHRESTHA (4)": "1nz3Tvjl6THGuXYKTnXLH8ZbYKxyfRy-w",
        "RK SHRESTHA (5)": "1CJfsghP6UOy5qv29ktUrhhNBhqnmqRj7"
      }
    },
    "7": {
      "9.1 TYPES OF ESTIMATES": {
        "part 1": "1rBzjzepgIo7OoT-PoIgodHyyYedxKqv1",
        "part 2": "1Rz4g_NVJWtR056fQWG2ZHn5ok-1j2oUV"
      },
      "9.2 QUANTITY CALC": {
        "part 1": "14qzMPn2bA5qCiP_ReNQVi2iQ_cv4rE1H",
        "part 2": "1qnf6cWxjt1rLf-iAVsWt1NV2v5cT_e37",
        "part 3": "1k7U6Tux_3BXbTW6GlsTmi8rvqd_kFEBD",
        "part 4": "1AYK2_zj5UAY5JxT-t5EH72iusbwmOPGy",
        "part 5": "1Rm4pTP5c5BQoh2Ocy_t7tc9_K7xfybhq",
        "part 6": "14uE0eIguNO8sbMuXsAu6n9NUAA0qnQGz"
      },
      "9.3 RATE ANALYSIS": {
        "part 1": "1y6sKmKP9qUvHhmMOHdaMl9lzOpqFb-fg",
        "part 2": "1wrEETT6sTABjpQdwIu0lZdCo-PGlZoJS"
      },
      "9.4 BOQ": {
        "part 1": "1xsxarF0Ylh7ksIaDchKso_MyV9B7gRHY",
        "part 2": "198lr-bt7GV1C3y2QOrhWut1TFzKie3ux"
      },
      "9.5 SPECIFICATION": {
        "part 1": "1CwxskwOoRPZr6LJEhyMhj9mUWpVf9FcH",
        "part 2": "1IBwv3r-GiHuEYIIOikBf3PI7OUtx8olo"
      },
      "9.6 VALUATION": {
        "part 1": "1a6r9dTp4vGZ-yzuaqgDbROZQOZ8tOMjN",
        "part 2": "1POyNam0oDEP-SYJomtTfGK1VjC4bm8Uq"
      },
      "9.7 Mixed Questions": {
        "part 1": "1t0Wf3EqAMdZh88CNSv2A49wez-QdORqH"
      },
      "9.8 Original Questions": {
        "DPARSAD.1-50": "1WR0c-cQrD6ZNrpW31pgFTrhekyT_0n4K",
        "DPARSAD.101-151": "1O3bhzDvGZfUTy1T9guFuq_aAn3PAq7Xi",
        "DPARSAD.151-200": "1E22sJNC6miJwVNDD5cz8EW3OXTWKc4XT",
        "DPARSAD.201-250": "1-VeNFb81ynETihERKfWNUOZSqrYopyOH",
        "DPARSAD.51-100": "1RjkK83GYpLncIqJJ2FGYkHh0FGGksJ_J",
        "RK SHRESTHA.1-81": "1x38YE2cp5xh0HDOS4MxJ4lvPqu3BdGdc",
        "RK SHRESTHA.82-162": "1XNc9kD0zGUJ1x3c-0wmL71XalNg46W42",
        "RK SHRESTHA.163-242": "1_QL2BkJ0KasZes4mlPqRdxygRCctGMS5",
        "Sunil Sah.1-60": "1gy-w5Blxv6apj-J3I3TweN1_x-Z_QEOO",
        "Sunil Sah.61-120": "1Vu83clEgZ5HYPt9u0X1RwBrnaBYQ6f-d",
        "Sunil Sah.121-180": "1psouu17RetzwmZAOAX0SDeIdbf5rPmYj",
        "Sunil Sah.181-240": "18zaqow3ZotVGbTkXJCorTxVl5ig1lUYw",
        "Sunil Sah.241-300": "1WsHj12btBEVatQvdgW3k75pnGc7LL1EY",
        "Sunil Sah.301-311": "1im9kZ4Ozp7UdWmOi9mU-WaQBA4f2jxqJ"
      }
    },
    "8": {
      "10.1 DRAWING SHEET": {
        "part 1": "1HyhZoMrl9z1bsX_bXiQ0FMOuc8SAZyHc",
        "part 2": "1EPoDukkS23EOd-HBkvqzSyKrNaqJiT26"
      },
      "10.2 SCALES&SITE PLANS": {
        "part 1": "1DpNL51689FyxVmvkA_CV1f81oyUXcyQK",
        "part 2": "1WXgNZMJxXhN718MnX5UW97-bBYikjcT6"
      },
      "10.3 PROJECTION THEORY": {
        "part 1": "1fPWwlzoXUOTW_z_vY22LQSz2hPvJtBV7",
        "part 2": "1oPZAqoQdIMR6PFFxaroPurS5vu4bOzyy",
        "part 3": "1FS5yiVFZitgwZ5VNK04Q2edNCdk4aGt2",
        "part 4": "1tihj5ht_jOixsY1vSHk3IeLxDLuH29Ih",
        "part 5": "1oEqjC5StHGBUNeIxS1StG5xV4xwchM1r",
        "part 6": "1OsmQ4d0qluJRNZL3KFJr8_jofahzXxhd"
      },
      "10.4 DRAFTING TOOLS": {
        "part 1": "102SbDKK3uFrbveB2fIRavtAo-tBfw9xr",
        "part 2": "1DVPbhfiMEWKCOopJLw9MVPPCVQXYHlp6",
        "part 3": "1e3e0Nn-dpUb6ApKesY7ko1lmVMpOVSMh"
      },
      "10.5 DRAFTING CONVENTIONS": {
        "part 1": "1pev2qgAmlLd7Y7Oe0lFunIW7kmo__5mS",
        "part 2": "1AqUIV_tpKqt8DepStEPIBFT20TIE5ISW"
      },
      "10.6 TOPO&SERVICE DWG": {
        "All": "188fC1VajbIZ-LPReuCBmh0hpd3ORgp7U"
      },
      "10.7 FREEHAND DRAWING": {
        "All": "1w9DjF6dx3JIPGw0fOBaKnUALjDDtwmnQ"
      },
      "10.9 Original Questions": {
        "DPARSAD.1-100": "1WqQPC_gqQ8gM43tMEatrpvFb91Rzfb5k",
        "DPARSAD.101-183": "1AXIlR6OKS9cG65HU5xZvyJWeNj6-MJk1",
        "RK SHRESTHA.1-71": "172V_845Zdr84U69dr0bmMDbxz56Ya74M",
        "RK SHRESTHA.143-213": "1EvRKn9B2I8jjT1UeWzB8IYiDKRhz0NSs",
        "RK SHRESTHA.72-142": "1YrxxoZ0IPON3ycUL0sa8sjiRHEtKip5r",
        "Sunil Sah.1-60": "1qz_zUBjdwFUwL5Sf2ZsRitj2a-YLyJiO",
        "Sunil Sah.61-120": "1KJE8TdtH2npCFgnT9aqh7OL-Bxie5gOI",
        "Sunil Sah.121-180": "1zljfSHkMsHIX0U7EikqQEQBclmjuZpmc",
        "Sunil Sah.181-240": "1USkoAe4X5fAaESnqG7dgMg_Uj9vMsR7Y",
        "Sunil Sah.241-300": "1_O1LBXaP2hzAyqPtuTqVCoCBVdZ-AJoK",
        "Sunil Sah.301-338": "1eiMPR4upitzO4epzLJ0droxwn9LBIYdK"
      }
    },
    "9": {
      "11.1 INTEREST&TIME VALUE": {
        "part 1": "1XhDDMvyll_5lRBUELNoThYe_qal8JrTz",
        "part 2": "1P-kbr6pzpAqhb44ACGzfagD8-YcEWrLN"
      },
      "11.2 ANNUITIES&SINKING FUND": {
        "All": "1IdU7eESWluEeFeyka58ngKD7muHFFz7s"
      },
      "11.3 NPV IRR WORTH METHODS": {
        "part 1": "1GJWNpofUhbU7AQ8XHDVDx8aAyLv0bMRu",
        "part 2": "1QgymQ-VlwmY4ij2yGUCe-5wdmoMGegL8",
        "part 3": "1SItSfY3zEKsc3REoOHQXV_mpHXSS5jxf"
      },
      "11.4 COST CONCEPTS": {
        "part 1": "10aGgsobAhi8nZSXj9cZOqxs_Z5gcwOnQ",
        "part 2": "1ltwF253VIjZV3ZHVR_RqBihmpcgbBUma"
      },
      "11.5 BREAKEVEN&SENSITIVITY": {
        "All": "1sBzflFZG20I5U6WJ0H3oUxtjTz6S68P5"
      },
      "11.6 ECONOMICS BASICS": {
        "part 1": "1awpbsccw-xPxd4YebX4EbzWMjIaCEmL7",
        "part 2": "1GSc_yDjznSu7crKJGmUlcBEYjZL_GXBK"
      },
      "11.8 Original Questions": {
        "DPARSAD.1-75": "1vzp6vp3jscMoDEsNwLTAdX6fw2qoOe55",
        "DPARSAD": "1abshceD1-c5wygd9L32gAoLpuYdBqkd8",
        "RK SHRESTHA.1-54": "1OJYDYMCCYbayimPJzRlf7ZNI3C48YJIw",
        "RK SHRESTHA.55-108": "1VBxr0CbRm7LYah9FBTC3Cnl2-ddyIV39",
        "Sunil Sah.1-73": "1VWMh_JXzHThB1sK4VMaZ61xlkcv7RJo-",
        "Sunil Sah.74-146": "1nIijfTYKAch0m__T7U63oNxb6TyOGrDK"
      }
    },
    "10": {
      "12.1 ETHICS&INTEGRITY": {
        "part 1": "12YZbxSMMsz4ZpxnYioCCLCOoRs1H0guO",
        "part 2": "195sGiX77N-JO0eS3revPpkSh5HAYhY7z"
      },
      "12.2 NEC ACT": {
        "part 1": "1oKKNRBVgXzqx6b9Gg2Ul9c0LCMJeM10-",
        "part 2": "1ctPiysFry0Ga5dimfyV71ah230LUKq6M",
        "part 3": "1yMxNR0HplGlqZavO2GyY8lxz_bfKSVXt"
      },
      "12.3 CLIENT&CONTRACTOR REL": {
        "All": "163IM7VQpLaooUVM-zO2dsp-EKU4Vm0en"
      },
      "12.4 PUBLIC PROCUREMENT": {
        "part 1": "1aqhwztnXWmwhOsGEieiQYHJ9KTeyqYSE",
        "part 2": "1xEjY22aWukAyrU_Q3w4LqT6oFnoc9s6P",
        "part 3": "10I5Na4DMbZRzsySyRXePisKV8I-SlNS0"
      },
      "12.5 NBC": {
        "All": "1TFEZbh8MT4A3m2-c9DziB04uVln8lYkP"
      },
      "12.6 BUILDING BYLAWS": {
        "All": "1n-L2O3li7hRwWBNU2rqcueaMoaGb2DSS"
      },
      "12.7 Mixed Questions": {
        "part 1": "1zDBYKRwlK6-SeQuRh7iCbWX7Tl7fWOMN"
      },
      "12.8 Original Questions": {
        "DPARSAD": "16Yw0SALw-Vk1KR-7HnRZdetJFqarj7S2",
        "RK SHRESTHA": "1TsbaxhfnQdqsR31Qc0m48q3aIO2rqHfy",
        "RK SHRESTHA (2)": "1hTK4XCovy30ZCZ5j5AmCOcTdfQCYLsTq",
        "Sunil Sah.1-60": "1P9J26lrPf1ne95WM0-JqNjdpqjAAKwHs",
        "Sunil Sah.61-120": "1zap782ErWfLbCqbfZDMATqz9vtZehHLA"
      }
    }
  }
};

/* ══════════════════════════════════════════════════════════════════════
   CHAPTERDATA — accessor API used by app.js / objective.js / admin.html.
   Signatures unchanged from the previous version.
   ══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

function _levels(){ return Object.keys(LEVEL_LABELS); }
function levelLabel(lv){ return LEVEL_LABELS[lv] || lv; }
function chapters(lv){ return CH_NAMES[lv] || {}; }
function chapterName(lv, ch){
  return (CH_NAMES[lv] && CH_NAMES[lv][String(ch)]) || `Chapter ${ch}`;
}
function books(lv, ch){
  return (DRIVE[lv] && DRIVE[lv][String(ch)]) || {};
}
function files(lv, ch, sub){
  return books(lv, ch)[sub] || {};
}

function chapterFileRefs(lv, ch){
  const out     = [];
  const chSubs  = books(lv, ch);
  const chLabel = chapterName(lv, ch);
  Object.keys(chSubs).forEach(subLabel => {
    const fm = chSubs[subLabel] || {};
    Object.keys(fm).forEach(fileLabel => {
      const fid = fm[fileLabel];
      if (!fid) return;
      out.push({
        lv:       String(lv),
        ch:       String(ch),
        book:     subLabel,
        subtopic: fileLabel,
        fid:      String(fid),
        key:      `${lv}_${ch}_${subLabel}_${fileLabel}`,
        name:     `${chLabel} — ${subLabel} — ${fileLabel}`
      });
    });
  });
  return out;
}

function allFileRefs(){
  const out = [];
  _levels().forEach(lv => {
    Object.keys(CH_NAMES[lv] || {}).forEach(ch => {
      out.push(...chapterFileRefs(lv, ch));
    });
  });
  return out;
}

function fileCount(lv, ch, sub){
  if (!lv){
    let t = 0;
    _levels().forEach(l => {
      Object.keys(CH_NAMES[l] || {}).forEach(c => {
        t += chapterFileRefs(l, c).length;
      });
    });
    return t;
  }
  if (!ch){
    let t = 0;
    Object.keys(CH_NAMES[lv] || {}).forEach(c => {
      t += chapterFileRefs(lv, c).length;
    });
    return t;
  }
  if (!sub) return chapterFileRefs(lv, ch).length;
  return Object.values(files(lv, ch, sub) || {}).filter(Boolean).length;
}

if (typeof window !== 'undefined') {
  window.CH_NAMES      = CH_NAMES;
  window.LEVEL_LABELS  = LEVEL_LABELS;
  window.DRIVE         = DRIVE;
  window.ChapterData = {
    levels: _levels, levelLabel, chapters, chapterName,
    books, files, chapterFileRefs, allFileRefs, fileCount
  };
}
})();
