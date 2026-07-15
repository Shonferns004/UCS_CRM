export default function Template1({ personal, education }) {
  return (
    <div className="print-page">
      <style>{`
        .t1 *{margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
        .t1{width:210mm;height:297mm;margin:auto;background:#fff;border:8px double #000;padding:12px 14px;overflow:hidden;display:flex;flex-direction:column}
        .t1 h1{text-align:center;font-size:34px;font-family:Georgia,serif;margin-bottom:0}
        .t1 .subtitle{text-align:center;font-size:10px;margin-bottom:2px}
        .t1 .top-line{border-top:3px solid #7d1e1e;margin:3px 0}
        .t1 .form-title{text-align:center;font-size:24px;font-weight:bold;text-decoration:underline;margin-bottom:12px}
        .t1 table{width:100%;border-collapse:collapse}
        .t1 td,.t1 th{border:1px solid #666;padding:7px 8px;vertical-align:top}
        .t1 .section{background:#d8d8d8;font-weight:bold;font-size:18px}
        .t1 .label{font-weight:bold;width:25%;white-space:nowrap}
        .t1 .photo{width:160px;text-align:center;vertical-align:middle;font-weight:bold;font-size:24px;min-height:160px;height:160px;box-sizing:border-box}
        .t1 .blank{height:24px}
        .t1 .address{height:40px}
        .t1 .edu th{text-align:center}
        .t1 .edu td{height:45px}
        .t1 .edu{border-bottom:1px solid #666}
        .t1 .footer{border-top:2px solid #7b2020;margin-top:auto;padding-top:3px;text-align:center;font-size:8pt;line-height:1.3}
        .t1 .decl-header{background:#d9d9d9;font-weight:bold;font-size:14px;padding:5px 8px;text-transform:uppercase;border:1px solid #666}
        .t1 .decl-text{font-family:"Times New Roman",serif;font-size:9pt;line-height:1.2;text-align:justify;margin:6px 0 8px 0}
        .t1 .decl-sig{display:flex;justify-content:flex-end;align-items:center;gap:16px;margin-top:8px}
        .t1 .decl-sig .decl-field{font-size:9pt;font-weight:bold}
        .t1 .decl-sig .decl-line{display:inline-block;border-bottom:1px solid #000;min-width:90px;height:14px;vertical-align:bottom}
        .t1 .decl-sig .decl-sign-box{width:120px;height:35px;border:1px solid #000;border-radius:8px;background:#fff}
      `}</style>
      <div className="t1">
        <div className="header">
          <h1>Being Sevak Charitable Trust</h1>
          <div className="top-line"></div>
          <div className="subtitle">Public Charitable Trust (Reg.) E-31948 No, Income Tax Exempted Under 80G</div>
        </div>
        <div className="form-title">VOLUNTEER JOINING FORM</div>
        <table>
          <tr><td colSpan="3" className="section">PERSONAL DETAILS</td></tr>
          <tr>
            <td className="label">Name :</td>
            <td style={{fontWeight:600}}>{personal.fullName || ''}</td>
            <td rowSpan="5" className="photo">PHOTOGRAPH</td>
          </tr>
          <tr>
            <td className="label">Father's / Husband Name :</td>
            <td style={{fontWeight:600}}>{personal.fatherHusband || ''}</td>
          </tr>
          <tr>
            <td className="label">Correspondence Address :</td>
            <td style={{fontWeight:600}}>{personal.address || ''}</td>
          </tr>
          <tr><td colSpan="2" className="address"></td></tr>
          <tr>
            <td className="label">Permanent Address :</td>
            <td style={{fontWeight:600}}>{personal.permanentAddress || personal.address || ''}</td>
          </tr>
          <tr><td colSpan="2" className="address"></td></tr>
          <tr>
            <td><strong>Mobile 1 :</strong> {personal.altPhone || ''}</td>
            <td><strong>Mobile 2:</strong> {personal.phone || ''}</td>
            <td><strong>Email ID :</strong> {personal.email || ''}</td>
          </tr>
          <tr>
            <td><strong>Date of Birth :</strong> {personal.dob || ''}</td>
            <td><strong>Marital Status :</strong> {personal.maritalStatus || ''}</td>
            <td><strong>Gender :</strong> {personal.gender || ''}</td>
          </tr>
          <tr>
            <td><strong>PAN Card No :</strong> {personal.panNumber || ''}</td>
            <td><strong>Aadhaar Card No :</strong> {personal.aadhaarNumber || ''}</td>
            <td></td>
          </tr>
          <tr><td colSpan="3" className="section">EDUCATIONAL DETAILS (higher education)</td></tr>
        </table>
        <table className="edu">
          <tr>
            <th>Degree</th>
            <th>University / Institute</th>
            <th>From</th>
            <th>To</th>
            <th>Percentage / Grade</th>
            <th>Specialization</th>
          </tr>
          {education.length === 0 ? (
            <>{[...Array(1)].map((_, i) => <tr key={i}><td></td><td></td><td></td><td></td><td></td><td></td></tr>)}</>
          ) : (
            education.slice(0, 1).map((e, i) => (
              <tr key={i}>
                <td>{e.degree || ''}</td>
                <td>{e.institution || ''}</td>
                <td>{e.year || ''}</td>
                <td></td>
                <td>{e.percentage || ''}</td>
                <td></td>
              </tr>
            ))
          )}
          {education.length > 0 && education.length < 1 && [...Array(1 - education.length)].map((_, i) => (
            <tr key={`empty-${i}`}><td></td><td></td><td></td><td></td><td></td><td></td></tr>
          ))}
        </table>
        <table>
          <tr><td colSpan="6" className="section">VOLUNTEER DETAILS (PREVIOUS ORGANISATIONS / AFFILIATIONS)</td></tr>
          <tr>
            <th width="8%">Sr.No</th>
            <th>Organisation / Trust</th>
            <th>Role / Designation</th>
            <th>From</th>
            <th>To</th>
            <th>Duration</th>
          </tr>
          <tr>
            <td>1</td>
            <td style={{height:40}}></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>
        <table>
          <tr><td colSpan="5" className="section">FAMILY DETAILS / PERSONAL REFERENCE</td></tr>
          <tr><th width="8%">S.No</th><th>Name</th><th>Relation</th><th>Occupation</th><th>Date of Birth</th></tr>
          {[...Array(3)].map((_, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td style={{height:35}}></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          ))}
        </table>
        <div className="footer">
          Reg. Add.: Office No. 402, 4th Floor, 'A' Wing, New Delite Apartment, Near Chandavarkar Lane, Borivali (West), Mumbai.<br />
          Contact: 8879035035 / 8879034034 | E-mail: being.sevak@gmail.com | Website: www.beingsevak.org
        </div>
      </div>
      <div className="t1" style={{borderTop:'none'}}>
        <div className="decl-header">DECLARATION</div>
        <div className="decl-text">
          I hereby declare that the above statements made in my application form are true, complete and correct to the best of my knowledge and belief. In the event of any information being found false or incorrect at any stage, my services are liable to be terminated without notice.
        </div>
        <div className="decl-sig">
          <div className="decl-field">Date: <span className="decl-line"></span></div>
          <div className="decl-field">Place: <span className="decl-line"></span></div>
          <div className="decl-field">Sign: <span className="decl-sign-box"></span></div>
        </div>
        <div className="footer">
          Reg. Add.: Office No. 402, 4th Floor, 'A' Wing, New Delite Apartment, Near Chandavarkar Lane, Borivali (West), Mumbai.<br />
          Contact: 8879035035 / 8879034034 | E-mail: being.sevak@gmail.com | Website: www.beingsevak.org
        </div>
      </div>
    </div>
  );
}
