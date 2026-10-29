using System;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;

internal sealed class FavoriteFolder
{
    public string id {get;set;}
    public string name {get;set;}
    public string path {get;set;}
    public string color {get;set;}
}
internal sealed class FolderFavorites
{
    private static readonly string[] Colors={"amber","sage","blue","lavender","rose","clay","teal"};
    private readonly string file;
    public FolderFavorites(string file){this.file=file;}
    public List<FavoriteFolder> Read()
    {
        if(!File.Exists(file))return new List<FavoriteFolder>();
        var folders=new JavaScriptSerializer().Deserialize<List<FavoriteFolder>>(File.ReadAllText(file));
        if(folders==null)throw new InvalidDataException("Favourite folders file could not be read.");
        var ids=new HashSet<string>();
        foreach(var folder in folders){
            if(folder==null || string.IsNullOrWhiteSpace(folder.id) || !ids.Add(folder.id) || string.IsNullOrWhiteSpace(folder.name) || string.IsNullOrWhiteSpace(folder.path) || !Path.IsPathRooted(folder.path))
                throw new InvalidDataException("Favourite folders file contains an invalid shortcut.");
            if(!Array.Exists(Colors,value=>value==folder.color))folder.color="amber";
        }
        return folders;
    }
    public List<FavoriteFolder> Add(string selected)
    {
        if(!Path.IsPathRooted(selected) || !Directory.Exists(selected))throw new DirectoryNotFoundException("The selected folder is unavailable.");
        string path=Path.GetFullPath(selected).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar);
        if(path.Length==2 && path[1]==':')path+=Path.DirectorySeparatorChar;
        var folders=Read();
        if(folders.Exists(folder=>string.Equals(folder.path.TrimEnd('\\','/'),path.TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase)))return folders;
        string name=new DirectoryInfo(path).Name;
        folders.Add(new FavoriteFolder{id=Guid.NewGuid().ToString("N"),name=string.IsNullOrEmpty(name)?path:name,path=path,color="amber"});
        Save(folders);return folders;
    }
    public List<FavoriteFolder> Remove(string id)
    {
        var folders=Read();folders.RemoveAll(folder=>folder.id==id);Save(folders);return folders;
    }
    public string PathFor(string id)
    {
        var folder=Read().Find(item=>item.id==id);
        if(folder==null)throw new InvalidOperationException("This folder shortcut no longer exists.");
        return folder.path;
    }
    public string Resolve(string id)
    {
        string path=PathFor(id);
        if(!Directory.Exists(path))throw new DirectoryNotFoundException("Folder unavailable. Reconnect its drive or remove this shortcut.");
        return path;
    }
    public List<FavoriteFolder> Rename(string id,string name)
    {
        if(string.IsNullOrWhiteSpace(name) || name.Trim().Length>80 || name.IndexOfAny(new char[]{'\r','\n','\0'})>=0)throw new ArgumentException("Enter a shortcut name between 1 and 80 characters.");
        var folders=Read();var folder=folders.Find(item=>item.id==id);
        if(folder==null)throw new InvalidOperationException("Folder shortcut no longer exists.");
        folder.name=name.Trim();Save(folders);return folders;
    }
    public List<FavoriteFolder> SetColor(string id,string color)
    {
        if(!Array.Exists(Colors,value=>value==color))throw new ArgumentException("Choose an available folder color.");
        var folders=Read();var folder=folders.Find(item=>item.id==id);
        if(folder==null)throw new InvalidOperationException("Folder shortcut no longer exists.");
        folder.color=color;Save(folders);return folders;
    }
    public List<FavoriteFolder> Reorder(List<string> ids)
    {
        var folders=Read();var seen=new HashSet<string>();var ordered=new List<FavoriteFolder>();
        if(ids.Count!=folders.Count)throw new ArgumentException("Folder list changed. Reopen the launcher before arranging it.");
        foreach(string id in ids){var folder=folders.Find(item=>item.id==id);if(folder==null || !seen.Add(id))throw new ArgumentException("Invalid folder order.");ordered.Add(folder);}
        Save(ordered);return ordered;
    }
    private void Save(List<FavoriteFolder> folders)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(file));
        string temporary=file+"."+Guid.NewGuid().ToString("N")+".tmp";
        try{
            using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
                byte[] bytes=System.Text.Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(folders));stream.Write(bytes,0,bytes.Length);stream.Flush(true);
            }
            if(File.Exists(file))File.Replace(temporary,file,file+".bak");else File.Move(temporary,file);
        }finally{if(File.Exists(temporary))File.Delete(temporary);}
    }
}
