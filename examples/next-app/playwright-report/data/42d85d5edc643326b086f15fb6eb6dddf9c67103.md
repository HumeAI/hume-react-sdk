# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - heading "Hume EVI React Example" [level=1] [ref=e3]
    - generic [ref=e5]:
      - checkbox "Enable audio worklet" [checked] [ref=e6]
      - text: Enable audio worklet
    - generic [ref=e8]:
      - generic [ref=e9]:
        - generic [ref=e10]: Status
        - generic [ref=e11]: error
      - generic [ref=e13]:
        - generic [ref=e14]: Tool use is disabled. Please provide the HUME_CONFIG_ID environment variable to enable tool use.
        - generic [ref=e15]:
          - generic [ref=e16]: Call duration
          - generic [ref=e17]: n/a
        - generic [ref=e18]:
          - generic [ref=e19]:
            - generic [ref=e20]: Microphone
            - combobox [ref=e21] [cursor=pointer]:
              - generic: Select microphone
              - img [ref=e22]
          - generic [ref=e25]:
            - generic [ref=e26]: Speaker
            - combobox [ref=e27] [cursor=pointer]:
              - generic: Select speaker
              - img [ref=e28]
        - button "Connect to voice" [ref=e31] [cursor=pointer]
        - generic [ref=e32]: Not supported
  - button "Open Next.js Dev Tools" [ref=e38] [cursor=pointer]:
    - img [ref=e39]
  - alert [ref=e42]
```